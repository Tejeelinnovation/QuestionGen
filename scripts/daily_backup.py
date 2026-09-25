"""
Automated Daily Backup Script for Question Generation System (Neon PostgreSQL).

Features:
- Fast bulk extraction of all 30 database tables directly over PostgreSQL protocol.
- Generates both .sql (transactional) and .json formats.
- Stores backups in a designated folder OUTSIDE the git repository.
- Organizes backups into 'sql/' and 'json/' subfolders.
- Enforces FIFO retention: maintains exactly the last 10 backups for both formats (total 20 files).
  Oldest files beyond the 10-backup limit are automatically deleted.
- Appends run logs to backup.log.
"""

import os
import sys
import json
import decimal
import datetime
import time
import argparse
import psycopg2

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

# Default backup storage directory (outside git repo)
DEFAULT_BACKUP_DIR = os.environ.get("BACKUP_STORAGE_DIR", r"D:\QuestionGenBackups")

# Neon unpooled direct connection URL
DEFAULT_DB_URL = "postgresql://neondb_owner:npg_92RniLMuEgVT@ep-sparkling-pine-aevzp49y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

TABLES_ORDER = [
    # 1. Base django and auth
    "django_migrations",
    "django_content_type",
    "auth_permission",
    "auth_group",
    "auth_group_permissions",
    
    # 2. Tenancy & capabilities
    "schools_school",
    "users_capability",
    "users_user",
    "users_usercapability",
    "users_user_groups",
    "users_user_user_permissions",
    "schools_classsection",
    "schools_classsubjectteacher",
    
    # 3. Content & Question bank
    "content_book",
    "content_chapter",
    "content_topic",
    "content_question",
    "content_question_topics",
    "content_questionvariant",
    "content_questionvalidationhistory",
    
    # 4. Papers & Deliveries
    "papers_paper",
    "papers_paperversion",
    "papers_delivery",
    "papers_delivery_assigned_students",
    
    # 5. Attempts, answers, audit
    "attempts_attempt",
    "attempts_answer",
    "core_auditlog",
    "django_session",
    "token_blacklist_outstandingtoken",
    "token_blacklist_blacklistedtoken",
]

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        if isinstance(obj, datetime.time):
            return obj.isoformat()
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        if isinstance(obj, (bytes, bytearray)):
            return obj.decode("utf-8", errors="replace")
        return super().default(obj)

def format_sql_value(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float, decimal.Decimal)):
        return str(val)
    if isinstance(val, (dict, list)):
        escaped = json.dumps(val).replace("'", "''")
        return f"'{escaped}'"
    if isinstance(val, (datetime.datetime, datetime.date, datetime.time)):
        return f"'{val.isoformat()}'"
    escaped = str(val).replace("'", "''")
    return f"'{escaped}'"

def rotate_old_backups(directory: str, extension: str, max_allowed: int = 10, log_fn=print):
    """
    Keep only the newest `max_allowed` files with the specified extension.
    Delete the oldest files if count exceeds `max_allowed`.
    """
    if not os.path.exists(directory):
        return
        
    files = [
        os.path.join(directory, f) 
        for f in os.listdir(directory) 
        if f.lower().endswith(extension.lower()) and os.path.isfile(os.path.join(directory, f))
    ]
    
    # Sort files by modification time, newest first
    files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    
    if len(files) > max_allowed:
        excess_files = files[max_allowed:]
        for f in excess_files:
            try:
                os.remove(f)
                log_fn(f"[ROTATION] Removed old backup file: {os.path.basename(f)}")
            except Exception as e:
                log_fn(f"[ERROR] Could not remove {f}: {e}")

def run_backup(target_dir: str = DEFAULT_BACKUP_DIR, max_retention: int = 10):
    start_time = time.time()
    now_dt = datetime.datetime.now()
    timestamp_str = now_dt.strftime("%Y%m%d_%H%M%S")
    
    sql_dir = os.path.join(target_dir, "sql")
    json_dir = os.path.join(target_dir, "json")
    os.makedirs(sql_dir, exist_ok=True)
    os.makedirs(json_dir, exist_ok=True)
    
    log_file = os.path.join(target_dir, "backup.log")
    
    def log(msg):
        line = f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
        print(line)
        try:
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass

    log(f"=== Starting Daily Backup to {target_dir} ===")
    
    # Try reading DATABASE_URL from .env if present
    db_url = DEFAULT_DB_URL
    try:
        from django.conf import settings
        import environ
        env_file = os.path.join(BASE_DIR, ".env")
        if os.path.exists(env_file):
            env = environ.Env()
            env.read_env(env_file)
            raw_url = env.str("DATABASE_URL", default=DEFAULT_DB_URL)
            # Ensure unpooled connection for clean schema resolution
            db_url = raw_url.replace("-pooler.", ".")
    except Exception:
        pass
        
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
    except Exception as e:
        log(f"[FATAL] Database connection failed: {e}")
        return False

    tables_dump = {}
    table_stats = {}
    
    sql_statements = [
        "-- Question Generation System Automated Database Backup",
        f"-- Generated at: {now_dt.isoformat()}",
        "-- Database: Neon PostgreSQL",
        "",
        "SET statement_timeout = 0;",
        "SET lock_timeout = 0;",
        "SET client_encoding = 'UTF8';",
        "SET standard_conforming_strings = on;",
        "SET check_function_bodies = false;",
        "SET client_min_messages = warning;",
        "SET row_security = off;",
        "SET search_path = public;",
        "",
        "BEGIN;",
        ""
    ]
    
    for tbl in reversed(TABLES_ORDER):
        sql_statements.append(f'TRUNCATE TABLE "{tbl}" CASCADE;')
    sql_statements.append("")

    total_rows = 0
    for table_name in TABLES_ORDER:
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position;
        """, (table_name,))
        col_defs = cur.fetchall()
        if not col_defs:
            continue
        
        columns = [c[0] for c in col_defs]
        quoted_cols = ', '.join([f'"{c}"' for c in columns])
        
        cur.execute(f'SELECT {quoted_cols} FROM "public"."{table_name}";')
        rows = cur.fetchall()
        total_rows += len(rows)
        table_stats[table_name] = len(rows)
        
        # JSON dump
        table_records = []
        for row in rows:
            record = dict(zip(columns, row))
            table_records.append(record)
        tables_dump[table_name] = table_records
        
        # SQL insert generation
        if rows:
            sql_statements.append(f"-- Data for {table_name} ({len(rows)} rows)")
            chunk_size = 100
            for i in range(0, len(rows), chunk_size):
                chunk = rows[i:i+chunk_size]
                values_list = []
                for row in chunk:
                    row_vals = ', '.join([format_sql_value(v) for v in row])
                    values_list.append(f"({row_vals})")
                sql_insert = f'INSERT INTO "{table_name}" ({quoted_cols}) VALUES\n  ' + ',\n  '.join(values_list) + ';'
                sql_statements.append(sql_insert)
            sql_statements.append("")

    sql_statements.append("COMMIT;")
    sql_statements.append("-- End of Backup")
    cur.close()
    conn.close()

    # 1. Write SQL file
    sql_filename = f"backup_{timestamp_str}.sql"
    sql_filepath = os.path.join(sql_dir, sql_filename)
    with open(sql_filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(sql_statements))
    sql_size_mb = os.path.getsize(sql_filepath) / (1024 * 1024)
    log(f"Saved SQL:  {sql_filename} ({sql_size_mb:.2f} MB)")

    # 2. Write JSON file
    json_filename = f"backup_{timestamp_str}.json"
    json_filepath = os.path.join(json_dir, json_filename)
    with open(json_filepath, "w", encoding="utf-8") as f:
        json.dump(tables_dump, f, indent=2, cls=CustomJSONEncoder, ensure_ascii=False)
    json_size_mb = os.path.getsize(json_filepath) / (1024 * 1024)
    log(f"Saved JSON: {json_filename} ({json_size_mb:.2f} MB)")

    # 3. Apply FIFO Retention policy (Keep max_retention latest files in each subfolder)
    rotate_old_backups(sql_dir, ".sql", max_allowed=max_retention, log_fn=log)
    rotate_old_backups(json_dir, ".json", max_allowed=max_retention, log_fn=log)

    elapsed = time.time() - start_time
    log(f"Backup SUCCESS: {len(table_stats)} tables, {total_rows} total rows in {elapsed:.2f}s")
    log("=========================================\n")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Automated DB Backup with Retention")
    parser.add_argument("--target-dir", default=DEFAULT_BACKUP_DIR, help="Destination directory outside repository")
    parser.add_argument("--retention", type=int, default=10, help="Number of daily backups to keep per format")
    args = parser.parse_args()
    
    success = run_backup(target_dir=args.target_dir, max_retention=args.retention)
    sys.exit(0 if success else 1)
