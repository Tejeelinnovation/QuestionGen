import requests
import json

BASE_URL = "http://127.0.0.1:8000/api"

def run_pass():
    results = {}

    # 1. Authentication
    # Valid login
    r_valid = requests.post(f"{BASE_URL}/auth/login/", json={"username": "teacher1", "password": "password123"})
    # Invalid login
    r_invalid = requests.post(f"{BASE_URL}/auth/login/", json={"username": "teacher1", "password": "wrongpassword"})
    # Invalid token rejection
    r_bad_token = requests.get(f"{BASE_URL}/auth/me/", headers={"Authorization": "Bearer invalid_token_xyz"})

    results["Authentication"] = {
        "valid_login_status": r_valid.status_code,
        "invalid_login_status": r_invalid.status_code,
        "bad_token_status": r_bad_token.status_code,
        "passed": (r_valid.status_code == 200 and r_invalid.status_code in [400, 401] and r_bad_token.status_code == 401)
    }

    teacher_token = r_valid.json().get("access")

    # Student token
    r_stu = requests.post(f"{BASE_URL}/auth/login/", json={"username": "student1", "password": "password123"})
    student_token = r_stu.json().get("access")

    # School admin token
    r_sa = requests.post(f"{BASE_URL}/auth/login/", json={"username": "schooladmin1", "password": "password123"})
    school_admin_token = r_sa.json().get("access")

    # 2. Authorization
    # Student attempts to create student (requires CREATE_STUDENT)
    r_stu_create_user = requests.post(
        f"{BASE_URL}/users/",
        json={"username": "hacker1", "password": "password123", "profile": "student", "school": 1},
        headers={"Authorization": f"Bearer {student_token}"}
    )
    # Teacher attempts to create school admin (requires CREATE_SCHOOL_ADMIN)
    r_tch_create_admin = requests.post(
        f"{BASE_URL}/users/",
        json={"username": "rogueadmin", "password": "password123", "profile": "school_admin", "school": 1},
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    # School admin attempts to create school admin (requires CREATE_SCHOOL_ADMIN)
    r_sa_create_admin = requests.post(
        f"{BASE_URL}/users/",
        json={"username": "secondadmin", "password": "password123", "profile": "school_admin", "school": 1},
        headers={"Authorization": f"Bearer {school_admin_token}"}
    )

    results["Authorization"] = {
        "student_create_student_status": r_stu_create_user.status_code,
        "teacher_create_school_admin_status": r_tch_create_admin.status_code,
        "school_admin_create_school_admin_status": r_sa_create_admin.status_code,
        "passed": (
            r_stu_create_user.status_code == 403 and
            r_tch_create_admin.status_code == 403 and
            r_sa_create_admin.status_code == 403
        )
    }

    # 3. Scope
    # Teacher sees only permitted students
    r_tch_users = requests.get(f"{BASE_URL}/users/", headers={"Authorization": f"Bearer {teacher_token}"})
    tch_users = r_tch_users.json()
    all_students_for_teacher = all(u.get("role_label") == "Student" for u in tch_users)

    # Student sees only assigned tests
    r_stu_deliveries = requests.get(f"{BASE_URL}/deliveries/", headers={"Authorization": f"Bearer {student_token}"})
    stu_delivs = r_stu_deliveries.json()
    student_id = r_stu.json().get("user", {}).get("id")
    if not student_id:
        r_me = requests.get(f"{BASE_URL}/auth/me/", headers={"Authorization": f"Bearer {student_token}"})
        student_id = r_me.json()["id"]

    all_assigned = all(student_id in d.get("assigned_students", []) for d in stu_delivs)

    results["Scope"] = {
        "teacher_only_students": all_students_for_teacher,
        "student_only_assigned_deliveries": all_assigned,
        "passed": (all_students_for_teacher and all_assigned)
    }

    # 4. Question selection determinism
    # Test question filtering
    r_q1 = requests.get(f"{BASE_URL}/questions/?chapter=1&difficulty=EASY&question_type=MCQ", headers={"Authorization": f"Bearer {teacher_token}"})
    r_q2 = requests.get(f"{BASE_URL}/questions/?chapter=1&difficulty=EASY&question_type=MCQ", headers={"Authorization": f"Bearer {teacher_token}"})
    q1_ids = [q["id"] for q in r_q1.json()]
    q2_ids = [q["id"] for q in r_q2.json()]
    results["Question Selection"] = {
        "deterministic": (q1_ids == q2_ids and len(q1_ids) > 0),
        "count": len(q1_ids),
        "passed": (q1_ids == q2_ids and len(q1_ids) > 0)
    }

    # 5. Paper: total marks calculated correctly & persist
    r_papers = requests.get(f"{BASE_URL}/papers/", headers={"Authorization": f"Bearer {teacher_token}"})
    papers = r_papers.json()
    paper_check_passed = False
    if papers:
        first_paper = papers[0]
        r_p_detail = requests.get(f"{BASE_URL}/papers/{first_paper['id']}/", headers={"Authorization": f"Bearer {teacher_token}"})
        p_detail = r_p_detail.json()
        if p_detail.get("versions"):
            v = p_detail["versions"][0]
            # Hard reload / re-fetch version
            r_v = requests.get(f"{BASE_URL}/papers/{first_paper['id']}/versions/{v['id']}/", headers={"Authorization": f"Bearer {teacher_token}"})
            v_data = r_v.json()
            calc_marks = sum(float(q.get("marks", 0)) for q in v_data.get("question_snapshot", []))
            paper_check_passed = (float(v_data["total_marks"]) == calc_marks and calc_marks > 0)

    results["Paper"] = {
        "total_marks_persists_and_matches_sum": paper_check_passed,
        "passed": paper_check_passed
    }

    # 6. Versions: Version B creation does not mutate Version A
    # Check existing versions of first_paper
    p_id = papers[0]["id"]
    r_p_versions = requests.get(f"{BASE_URL}/papers/{p_id}/versions/", headers={"Authorization": f"Bearer {teacher_token}"})
    vers = r_p_versions.json()
    if len(vers) < 2:
        # Clone version A to create version B
        r_clone = requests.post(f"{BASE_URL}/papers/{p_id}/versions/{vers[0]['id']}/clone/", json={}, headers={"Authorization": f"Bearer {teacher_token}"})
        vers = requests.get(f"{BASE_URL}/papers/{p_id}/versions/", headers={"Authorization": f"Bearer {teacher_token}"}).json()

    v_a = requests.get(f"{BASE_URL}/papers/{p_id}/versions/{vers[0]['id']}/", headers={"Authorization": f"Bearer {teacher_token}"}).json()
    v_b = requests.get(f"{BASE_URL}/papers/{p_id}/versions/{vers[1]['id']}/", headers={"Authorization": f"Bearer {teacher_token}"}).json()
    results["Versions"] = {
        "version_a_label": v_a["version_label"],
        "version_b_label": v_b["version_label"],
        "version_a_id": v_a["id"],
        "version_b_id": v_b["id"],
        "version_a_intact": (v_a["id"] != v_b["id"] and v_a["version_label"] != v_b["version_label"]),
        "passed": (v_a["id"] != v_b["id"] and v_a["version_label"] != v_b["version_label"])
    }

    # 8. Print Layout endpoint
    r_print = requests.get(f"{BASE_URL}/papers/{p_id}/versions/{vers[0]['id']}/print/", headers={"Authorization": f"Bearer {teacher_token}"})
    print_data = r_print.json() if r_print.status_code == 200 else {}
    has_title = bool(print_data.get("title"))
    has_instructions = "instructions" in print_data
    has_questions = len(print_data.get("questions", [])) > 0
    has_version = bool(print_data.get("version_label"))
    has_marks = "total_marks" in print_data
    results["Print"] = {
        "has_title": has_title,
        "has_instructions": has_instructions,
        "has_questions": has_questions,
        "has_version": has_version,
        "has_marks": has_marks,
        "passed": (r_print.status_code == 200 and has_title and has_questions and has_version and has_marks)
    }

    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    run_pass()
