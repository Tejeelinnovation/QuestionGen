"""
Views for the schools app.
"""

from __future__ import annotations

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.audit import log_action
from users.permissions import HasCapability
from .models import ClassSection, ClassSubjectTeacher, School
from .services.bulk_importer import BulkImporter
from .services.excel_templates import generate_student_template, generate_teacher_template
from .serializers import (
    ClassSectionCreateUpdateSerializer,
    ClassSectionSerializer,
    ClassSubjectTeacherSerializer,
    SchoolSerializer,
)


class SchoolViewSet(viewsets.ModelViewSet):
    """
    ViewSet for listing, creating, and updating Schools.

    - list / retrieve: Any authenticated user can view schools (e.g. for dropdowns).
    - create / update / delete: Requires CREATE_SCHOOL capability (Super Admin).
    - create: Supports atomic provisioning of an initial School Administrator via optional `admin` payload.
    """

    queryset = School.objects.all()
    serializer_class = SchoolSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), HasCapability("CREATE_SCHOOL")()]
        return [IsAuthenticated()]

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        admin_data = request.data.get("admin")
        if not admin_data:
            return Response(
                {
                    "admin": [
                        "School Administrator details are required. School and School Admin must be created together."
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        school = serializer.save()

        from users.serializers import CreateUserSerializer, UserSerializer  # noqa: PLC0415
        admin_payload = {
            **admin_data,
            "school": school.id,
            "profile": "school_admin",
        }
        admin_serializer = CreateUserSerializer(
            data=admin_payload, context={"request": request}
        )
        admin_serializer.is_valid(raise_exception=True)
        created_admin = admin_serializer.save(created_by=request.user)
        log_action(
            request.user,
            "user.created",
            created_admin,
            metadata={
                "username": created_admin.username,
                "role": "School Admin",
                "school_id": school.id,
            },
        )

        log_action(
            request.user,
            "school.created",
            school,
            metadata={"name": school.name, "school_id": school.id},
        )
        headers = self.get_success_headers(serializer.data)
        response_data = serializer.data
        response_data["admin"] = UserSerializer(created_admin, context={"request": request}).data
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_update(self, serializer):
        school = serializer.save()
        log_action(
            self.request.user,
            "school.updated",
            school,
            metadata={"name": school.name, "school_id": school.id},
        )

    @action(detail=True, methods=["get", "post"], url_path="upload-policy")
    def upload_policy(self, request, pk=None):
        """
        Manage school-level bulk study material upload permissions.
        - GET: Returns the current bulk toggle status and lists any users who held individual grants prior to bulk.
        - POST: Enables or disables bulk permissions with conflict resolution for prior individual grants.
        """
        school = self.get_object()

        if not (request.user.is_superuser or request.user.has_capability("CREATE_SCHOOL")):
            return Response(
                {"detail": "Only Super Admins can manage school bulk upload policies."},
                status=status.HTTP_403_FORBIDDEN,
            )

        from users.models import Capability, CapabilityName, User, UserCapability

        policy = school.config.get("study_material_bulk_policy") or {}
        roles_meta = {
            "teachers": {"label": "Teachers"},
            "students": {"label": "Students"},
            "school_admins": {"label": "School Admins"},
        }

        cap = Capability.objects.filter(name=CapabilityName.UPLOAD_STUDY_MATERIAL).first()
        if not cap:
            return Response(
                {"detail": "UPLOAD_STUDY_MATERIAL capability not found in database."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        def get_group_users_qs(group_key: str, only_active: bool = False):
            qs = User.objects.filter(school=school)
            if only_active:
                qs = qs.filter(is_active=True)
            if group_key == "teachers":
                return qs.filter(role__in=["Teacher", "teacher"])
            elif group_key == "students":
                return qs.filter(role__in=["Student", "student"])
            elif group_key == "school_admins":
                return qs.filter(role__in=["School Admin", "school_admin"])
            return qs.none()

        if request.method == "GET":
            result = {}
            for key in roles_meta.keys():
                group_policy = policy.get(key, {})
                enabled = bool(group_policy.get("enabled", False))
                prior_ids = group_policy.get("prior_grant_user_ids", [])

                users_qs = get_group_users_qs(key, only_active=True)
                total_count = users_qs.count()
                active_with_cap = (
                    users_qs.filter(user_capabilities__capability=cap).distinct().count()
                )

                prior_users = []
                if prior_ids:
                    prior_qs = User.objects.filter(id__in=prior_ids, school=school)
                    for u in prior_qs:
                        full_name = f"{u.first_name} {u.last_name}".strip()
                        prior_users.append({
                            "id": u.id,
                            "username": u.username,
                            "name": full_name or u.username,
                        })

                result[key] = {
                    "enabled": enabled,
                    "total_count": total_count,
                    "active_with_permission": active_with_cap,
                    "prior_users": prior_users,
                }
            return Response(result)

        elif request.method == "POST":
            role_group = request.data.get("role_group")
            if role_group not in roles_meta:
                return Response(
                    {"detail": f"Invalid role_group. Must be one of: {list(roles_meta.keys())}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            enabled = bool(request.data.get("enabled", False))
            preserve_prior = bool(request.data.get("preserve_prior_grants", True))

            users_qs = get_group_users_qs(role_group, only_active=False)

            with transaction.atomic():
                group_policy = policy.get(role_group, {})

                if enabled:
                    # Record prior individual holders before bulk grant
                    existing_user_ids = list(
                        users_qs.filter(user_capabilities__capability=cap)
                        .values_list("id", flat=True)
                    )
                    group_policy["prior_grant_user_ids"] = existing_user_ids
                    group_policy["enabled"] = True

                    # Grant to all users in this group who don't already have it
                    unassigned_users = users_qs.exclude(id__in=existing_user_ids)
                    new_caps = [
                        UserCapability(
                            user=u,
                            capability=cap,
                            granted_by=request.user,
                        )
                        for u in unassigned_users
                    ]
                    UserCapability.objects.bulk_create(new_caps, ignore_conflicts=True)

                    log_action(
                        request.user,
                        "school.bulk_upload_policy.enabled",
                        school,
                        metadata={
                            "role_group": role_group,
                            "prior_grant_count": len(existing_user_ids),
                            "total_affected": users_qs.count(),
                        },
                    )
                else:
                    prior_ids = set(group_policy.get("prior_grant_user_ids", []))
                    group_policy["enabled"] = False

                    if preserve_prior and prior_ids:
                        # Revoke only from users granted by bulk, keep prior individual grants
                        revoke_qs = users_qs.exclude(id__in=prior_ids)
                        UserCapability.objects.filter(
                            user__in=revoke_qs,
                            capability=cap,
                        ).delete()
                    else:
                        # Revoke for all in this role group
                        UserCapability.objects.filter(
                            user__in=users_qs,
                            capability=cap,
                        ).delete()

                    group_policy["prior_grant_user_ids"] = []

                    log_action(
                        request.user,
                        "school.bulk_upload_policy.disabled",
                        school,
                        metadata={
                            "role_group": role_group,
                            "preserved_prior": preserve_prior,
                            "prior_count": len(prior_ids),
                        },
                    )

                policy[role_group] = group_policy
                school.config["study_material_bulk_policy"] = policy
                school.save(update_fields=["config"])

            # Return refreshed policy structure
            result = {}
            for key in roles_meta.keys():
                gp = policy.get(key, {})
                en = bool(gp.get("enabled", False))
                pids = gp.get("prior_grant_user_ids", [])
                u_qs = get_group_users_qs(key, only_active=True)
                p_users = []
                if pids:
                    p_qs = User.objects.filter(id__in=pids, school=school)
                    for u in p_qs:
                        fn = f"{u.first_name} {u.last_name}".strip()
                        p_users.append({"id": u.id, "username": u.username, "name": fn or u.username})
                result[key] = {
                    "enabled": en,
                    "total_count": u_qs.count(),
                    "active_with_permission": u_qs.filter(user_capabilities__capability=cap).distinct().count(),
                    "prior_users": p_users,
                }
            return Response(result)


class ClassSectionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing ClassSection divisions and their subject teachers.
    Scoped by the authenticated user's school.
    """

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return ClassSection.objects.none()
        if user.school_id is None:
            # Super Admin
            school_id = self.request.query_params.get("school_id")
            if school_id:
                return ClassSection.objects.filter(school_id=school_id)
            return ClassSection.objects.all()
        return ClassSection.objects.filter(school_id=user.school_id)

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ClassSectionCreateUpdateSerializer
        return ClassSectionSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "subject_teachers"):
            # Allow users with school-wide controls (School Admin) or Super Admin
            return [IsAuthenticated(), HasCapability("VIEW_SCHOOL_WIDE_CONTROLS")()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        school = serializer.validated_data.get("school")
        if user.school_id is not None:
            school = user.school
        instance = serializer.save(school=school)
        log_action(
            user,
            "class_section.created",
            instance,
            metadata={"name": instance.name, "school_id": instance.school_id},
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        log_action(
            self.request.user,
            "class_section.updated",
            instance,
            metadata={"name": instance.name, "school_id": instance.school_id},
        )

    def perform_destroy(self, instance):
        log_action(
            self.request.user,
            "class_section.deleted",
            instance,
            metadata={"name": instance.name, "school_id": instance.school_id},
        )
        instance.delete()

    @action(detail=True, methods=["get", "post", "delete"], url_path="subject-teachers")
    def subject_teachers(self, request, pk=None):
        class_section = self.get_object()
        if request.method == "GET":
            mappings = class_section.subject_teachers.all()
            serializer = ClassSubjectTeacherSerializer(mappings, many=True)
            return Response(serializer.data)

        if request.method == "POST":
            data = request.data.copy()
            data["class_section"] = class_section.id
            serializer = ClassSubjectTeacherSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            mapping = serializer.save()
            log_action(
                request.user,
                "class_section.subject_teacher_assigned",
                mapping,
                metadata={
                    "class": class_section.name,
                    "subject": mapping.subject,
                    "teacher_id": mapping.teacher_id,
                },
            )
            return Response(ClassSubjectTeacherSerializer(mapping).data, status=status.HTTP_201_CREATED)

        if request.method == "DELETE":
            subject = request.data.get("subject") or request.query_params.get("subject")
            if not subject:
                return Response(
                    {"detail": "'subject' is required to delete mapping."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            deleted, _ = class_section.subject_teachers.filter(subject__iexact=subject.strip()).delete()
            if deleted:
                return Response(status=status.HTTP_204_NO_CONTENT)
            return Response({"detail": "Subject mapping not found."}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=["get"], url_path="students")
    def students(self, request, pk=None):
        class_section = self.get_object()
        students = class_section.students.filter(role="Student")
        from users.serializers import UserSerializer  # noqa: PLC0415
        serializer = UserSerializer(students, many=True, context={"request": request})
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="my-assignments")
    def my_assignments(self, request):
        """
        Returns class sections and subject assignments specifically for the authenticated teacher.
        Includes:
        1. Class sections where the teacher is designated as the Main Class Teacher.
        2. All subject teaching mappings where the teacher is assigned to teach in a division.
        """
        user = request.user
        if not user.is_authenticated:
            return Response({"class_teacher_sections": [], "subject_assignments": []})

        ct_sections = (
            ClassSection.objects.filter(class_teacher=user)
            .select_related("school", "class_teacher")
            .prefetch_related("subject_teachers", "students")
        )
        ct_serializer = ClassSectionSerializer(ct_sections, many=True, context={"request": request})

        st_records = (
            ClassSubjectTeacher.objects.filter(teacher=user)
            .select_related("class_section", "class_section__class_teacher", "class_section__school")
            .prefetch_related("class_section__students")
        )

        subject_assignments = []
        for st in st_records:
            sec = st.class_section
            ct_name = None
            if sec.class_teacher:
                ct_name = (
                    f"{sec.class_teacher.first_name} {sec.class_teacher.last_name}".strip()
                    or sec.class_teacher.username
                )
            subject_assignments.append({
                "id": st.id,
                "class_section_id": sec.id,
                "class_name": sec.name,
                "standard": sec.standard,
                "section": sec.section,
                "subject": st.subject,
                "student_count": sec.students.filter(role="Student").count(),
                "max_students": sec.max_students,
                "class_teacher_id": sec.class_teacher_id,
                "class_teacher_name": ct_name,
                "is_class_teacher": (sec.class_teacher_id == user.id),
            })

        return Response({
            "class_teacher_sections": ct_serializer.data,
            "subject_assignments": subject_assignments,
        })


class BulkImportViewSet(viewsets.ViewSet):
    """
    ViewSet for downloading bulk import Excel templates, checking capacity,
    and processing Excel-based student and teacher cohorts.
    """

    permission_classes = [IsAuthenticated]

    def _resolve_school(self, request, requested_school_id=None):
        user = request.user
        can_import = user.has_capability("VIEW_SCHOOL_WIDE_CONTROLS") or user.has_capability("CREATE_SCHOOL")
        if not can_import:
            return None, Response(
                {"detail": "You do not have permission to access bulk import features."},
                status=status.HTTP_403_FORBIDDEN,
            )

        target_school_id = requested_school_id or user.school_id
        if user.school_id is not None:
            # School Admin can only access their own school
            if requested_school_id and int(requested_school_id) != user.school_id:
                return None, Response(
                    {"detail": "You cannot perform imports for another school."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            target_school_id = user.school_id

        if not target_school_id:
            return None, Response(
                {"detail": "'school_id' parameter is required for Super Admin."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            school = School.objects.get(id=target_school_id)
            return school, None
        except School.DoesNotExist:
            return None, Response(
                {"detail": "Target school not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=False, methods=["get"], url_path="template")
    def template(self, request):
        """
        Download sample Excel template for Student or Teacher import.
        Query param: ?type=student | teacher
        """
        template_type = request.query_params.get("type", "student").strip().lower()
        if template_type == "teacher":
            content = generate_teacher_template()
            filename = "teacher_import_sample.xlsx"
        else:
            content = generate_student_template()
            filename = "student_import_sample.xlsx"

        response = HttpResponse(
            content,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=["get"], url_path="capacity")
    def capacity(self, request):
        """
        Returns configured limit, current usage, and remaining capacity for students and teachers.
        """
        school_id = request.query_params.get("school_id")
        school, err_response = self._resolve_school(request, school_id)
        if err_response:
            return err_response

        current_students = school.users.filter(role="Student").count()
        current_teachers = school.users.filter(role="Teacher").count()

        return Response({
            "school_id": school.id,
            "school_name": school.name,
            "students": {
                "limit": school.max_students,
                "current": current_students,
                "remaining": max(0, school.max_students - current_students),
            },
            "teachers": {
                "limit": school.max_teachers,
                "current": current_teachers,
                "remaining": max(0, school.max_teachers - current_teachers),
            },
        })

    @action(
        detail=False,
        methods=["post"],
        url_path="students",
        parser_classes=[MultiPartParser, FormParser],
    )
    def students(self, request):
        """
        Upload and process completed Student workbook.
        Enforces atomic capacity checks and prevents duplicate account creation.
        """
        school_id = request.data.get("school_id") or request.query_params.get("school_id")
        school, err_response = self._resolve_school(request, school_id)
        if err_response:
            return err_response

        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response(
                {"detail": "Please attach an Excel file (.xlsx) with form key 'file'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_bytes = uploaded_file.read()
        report = BulkImporter.import_students_from_excel(file_bytes, school.id, request.user)
        summary = report.get("summary", {})
        if "error" not in report:
            log_action(
                request.user,
                "excel_import.executed",
                school,
                metadata={
                    "type": "student",
                    "created_count": summary.get("created_count", 0),
                    "rejected_count": summary.get("invalid_count", 0),
                    "duplicate_count": summary.get("duplicate_count", 0),
                    "overlimit_count": summary.get("over_limit_count", 0),
                },
            )
        return Response(
            report,
            status=status.HTTP_200_OK if "error" not in report else status.HTTP_400_BAD_REQUEST,
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="teachers",
        parser_classes=[MultiPartParser, FormParser],
    )
    def teachers(self, request):
        """
        Upload and process completed Teacher workbook.
        Enforces atomic capacity checks and prevents duplicate account creation.
        """
        school_id = request.data.get("school_id") or request.query_params.get("school_id")
        school, err_response = self._resolve_school(request, school_id)
        if err_response:
            return err_response

        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response(
                {"detail": "Please attach an Excel file (.xlsx) with form key 'file'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_bytes = uploaded_file.read()
        report = BulkImporter.import_teachers_from_excel(file_bytes, school.id, request.user)
        summary = report.get("summary", {})
        if "error" not in report:
            log_action(
                request.user,
                "excel_import.executed",
                school,
                metadata={
                    "type": "teacher",
                    "created_count": summary.get("created_count", 0),
                    "rejected_count": summary.get("invalid_count", 0),
                    "duplicate_count": summary.get("duplicate_count", 0),
                    "overlimit_count": summary.get("over_limit_count", 0),
                },
            )
        return Response(
            report,
            status=status.HTTP_200_OK if "error" not in report else status.HTTP_400_BAD_REQUEST,
        )



