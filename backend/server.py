"""
Flowguard-AI Backend API & SQLite Database Server

Features:
- Fixed Alert Clearing on Bottle Refill / Reset.
- Nurse Editing & Duty Status Management (`PUT /api/nurses/{nurse_id}`).
- Interactive 3D Model & Continuous Audio Alert Support.
- SQLite Database Persistence.
"""

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
import datetime
import os
import requests
import csv
import io
from typing import Optional, List

DB_FILE = os.path.join(os.path.dirname(__file__), "flowguard.db")

app = FastAPI(
    title="Flowguard-AI API Server",
    description="Backend Server & SQLite Database for Flowguard-AI Clinical Dashboard",
    version="2.2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Nurses Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS nurses (
            nurse_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            shift TEXT DEFAULT 'Morning (07:00 - 15:00)',
            contact TEXT DEFAULT '',
            status TEXT DEFAULT 'On Duty',
            assigned_beds_count INTEGER DEFAULT 0
        )
    """)

    # Doctors Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS doctors (
            doc_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            specialty TEXT DEFAULT 'Intensive Care Unit (ICU)',
            contact TEXT DEFAULT '',
            status TEXT DEFAULT 'Available'
        )
    """)

    # Beds & Patient Records Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS beds (
            bed_id TEXT PRIMARY KEY,
            patient_name TEXT NOT NULL,
            age_gender TEXT DEFAULT '45/M',
            doctor_name TEXT DEFAULT 'Dr. Petra Winburry',
            assigned_nurse TEXT DEFAULT 'Nurse Aishani',
            room_no TEXT NOT NULL,
            fluid_type TEXT NOT NULL,
            full_volume_ml REAL DEFAULT 500.0,
            current_volume_ml REAL DEFAULT 500.0,
            percentage REAL DEFAULT 100.0,
            flow_rate_mlm REAL DEFAULT 0.0,
            tte_minutes INTEGER DEFAULT 999,
            status TEXT DEFAULT 'NORMAL',
            blynk_token TEXT DEFAULT '',
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Telemetry Logs Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS telemetry_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bed_id TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            volume_ml REAL,
            percentage REAL,
            flow_rate_mlm REAL,
            tte_minutes INTEGER,
            status TEXT,
            FOREIGN KEY (bed_id) REFERENCES beds (bed_id)
        )
    """)

    # Alert Logs Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS alert_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bed_id TEXT NOT NULL,
            alert_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            blocked_duration_mins INTEGER DEFAULT 0,
            acknowledged INTEGER DEFAULT 0,
            acknowledged_by TEXT DEFAULT '',
            acknowledged_at TIMESTAMP,
            resolved_at TIMESTAMP,
            FOREIGN KEY (bed_id) REFERENCES beds (bed_id)
        )
    """)

    # Seed Default Nurses if empty
    cursor.execute("SELECT COUNT(*) FROM nurses")
    if cursor.fetchone()[0] == 0:
        default_nurses = [
            ("NURSE-01", "Nurse Aishani", "Morning (07:00 - 15:00)", "+91 98765 43210", "On Duty", 2),
            ("NURSE-02", "Nurse Tejaswini", "Evening (15:00 - 23:00)", "+91 98765 43211", "On Duty", 1),
            ("NURSE-03", "Nurse Durga", "Night (23:00 - 07:00)", "+91 98765 43212", "On Standby", 0)
        ]
        cursor.executemany("""
            INSERT INTO nurses (nurse_id, name, shift, contact, status, assigned_beds_count)
            VALUES (?, ?, ?, ?, ?, ?)
        """, default_nurses)

    # Seed Default Doctors if empty
    cursor.execute("SELECT COUNT(*) FROM doctors")
    if cursor.fetchone()[0] == 0:
        default_docs = [
            ("DOC-01", "Dr. Petra Winburry", "Chief Intensivist (ICU)", "+91 98111 22334", "Available"),
            ("DOC-02", "Dr. Rajesh Kumar", "General Medicine Lead", "+91 98111 22335", "In Surgery"),
            ("DOC-03", "Dr. Ananya Roy", "Pediatric Care Specialist", "+91 98111 22336", "Available")
        ]
        cursor.executemany("""
            INSERT INTO doctors (doc_id, name, specialty, contact, status)
            VALUES (?, ?, ?, ?, ?)
        """, default_docs)

    # Seed Default Beds if empty
    cursor.execute("SELECT COUNT(*) FROM beds")
    if cursor.fetchone()[0] == 0:
        default_beds = [
            ("ICU-01", "A. Sharma", "52/M", "Dr. Petra Winburry", "Nurse Aishani", "ICU Room 104", "Saline 0.9% (500ml)", 500.0, 442.5, 88.5, 4.6, 96, "NORMAL", "DEMO_TOKEN_1"),
            ("ICU-02", "R. Verma", "38/F", "Dr. Petra Winburry", "Nurse Aishani", "ICU Room 108", "Dextrose 5% (500ml)", 500.0, 22.0, 4.4, 5.1, 4, "CRITICAL_LOW", "DEMO_TOKEN_2"),
            ("ICU-03", "K. Patel", "61/M", "Dr. Rajesh Kumar", "Nurse Tejaswini", "ICU Room 112", "Ringer's Lactate (1000ml)", 1000.0, 780.0, 78.0, 0.0, 999, "BLOCKED", "DEMO_TOKEN_3")
        ]
        cursor.executemany("""
            INSERT INTO beds (bed_id, patient_name, age_gender, doctor_name, assigned_nurse, room_no, fluid_type, full_volume_ml, current_volume_ml, percentage, flow_rate_mlm, tte_minutes, status, blynk_token)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, default_beds)

    conn.commit()
    conn.close()

init_db()

# --- Data Models ---
class BedCreate(BaseModel):
    bed_id: str
    patient_name: str
    age_gender: Optional[str] = "45/M"
    doctor_name: Optional[str] = "Dr. Petra Winburry"
    assigned_nurse: Optional[str] = "Nurse Aishani"
    room_no: str
    fluid_type: str
    full_volume_ml: float = 500.0
    blynk_token: Optional[str] = ""

class NurseCreate(BaseModel):
    nurse_id: str
    name: str
    shift: str
    contact: str
    status: str = "On Duty"

class TelemetryIngest(BaseModel):
    bed_id: str
    volume_ml: float
    percentage: float
    flow_rate_mlm: float
    tte_minutes: int
    status: str

class AlertAcknowledge(BaseModel):
    alert_id: int
    nurse_name: str

# --- API Endpoints ---

@app.get("/api/health")
def health_check():
    return {"status": "online", "database": "sqlite", "brand": "Flowguard-AI", "version": "2.2.0"}

@app.get("/api/nurses")
def get_nurses():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nurses")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/nurses")
def add_or_update_nurse(nurse: NurseCreate):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO nurses (nurse_id, name, shift, contact, status)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(nurse_id) DO UPDATE SET
            name=excluded.name, shift=excluded.shift, contact=excluded.contact, status=excluded.status
    """, (nurse.nurse_id, nurse.name, nurse.shift, nurse.contact, nurse.status))
    conn.commit()
    conn.close()
    return {"message": f"Nurse {nurse.name} saved successfully"}

@app.put("/api/nurses/{nurse_id}")
def update_nurse(nurse_id: str, nurse: NurseCreate):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE nurses SET
            name = ?, shift = ?, contact = ?, status = ?
        WHERE nurse_id = ?
    """, (nurse.name, nurse.shift, nurse.contact, nurse.status, nurse_id))
    conn.commit()
    conn.close()
    return {"message": f"Nurse {nurse_id} updated successfully"}

@app.get("/api/doctors")
def get_doctors():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM doctors")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.get("/api/beds")
def get_all_beds():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM beds")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/beds")
def add_or_update_bed(bed: BedCreate):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO beds (
            bed_id, patient_name, age_gender, doctor_name, assigned_nurse, 
            room_no, fluid_type, full_volume_ml, current_volume_ml, percentage, blynk_token, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 100.0, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(bed_id) DO UPDATE SET
            patient_name=excluded.patient_name,
            age_gender=excluded.age_gender,
            doctor_name=excluded.doctor_name,
            assigned_nurse=excluded.assigned_nurse,
            room_no=excluded.room_no,
            fluid_type=excluded.fluid_type,
            full_volume_ml=excluded.full_volume_ml,
            current_volume_ml=excluded.full_volume_ml,
            percentage=100.0,
            blynk_token=excluded.blynk_token,
            last_updated=CURRENT_TIMESTAMP
    """, (
        bed.bed_id, bed.patient_name, bed.age_gender, bed.doctor_name, bed.assigned_nurse,
        bed.room_no, bed.fluid_type, bed.full_volume_ml, bed.full_volume_ml, bed.blynk_token
    ))
    conn.commit()
    conn.close()
    return {"message": f"Bed {bed.bed_id} saved successfully"}

@app.delete("/api/beds/{bed_id}")
def remove_bed(bed_id: str):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM beds WHERE bed_id = ?", (bed_id,))
    cursor.execute("DELETE FROM alert_logs WHERE bed_id = ?", (bed_id,))
    cursor.execute("DELETE FROM telemetry_logs WHERE bed_id = ?", (bed_id,))
    conn.commit()
    conn.close()
    return {"message": f"Bed {bed_id} discharged/removed successfully"}

@app.post("/api/telemetry")
def ingest_telemetry(data: TelemetryIngest):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute("""
        UPDATE beds SET
            current_volume_ml = ?,
            percentage = ?,
            flow_rate_mlm = ?,
            tte_minutes = ?,
            status = ?,
            last_updated = CURRENT_TIMESTAMP
        WHERE bed_id = ?
    """, (data.volume_ml, data.percentage, data.flow_rate_mlm, data.tte_minutes, data.status, data.bed_id))

    cursor.execute("""
        INSERT INTO telemetry_logs (bed_id, volume_ml, percentage, flow_rate_mlm, tte_minutes, status)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (data.bed_id, data.volume_ml, data.percentage, data.flow_rate_mlm, data.tte_minutes, data.status))

    if data.status in ["CRITICAL_LOW", "BLOCKED", "EMPTY"]:
        cursor.execute("""
            SELECT id FROM alert_logs 
            WHERE bed_id = ? AND alert_type = ? AND resolved_at IS NULL
        """, (data.bed_id, data.status))
        existing = cursor.fetchone()
        if not existing:
            severity = "HIGH" if data.status in ["CRITICAL_LOW", "EMPTY"] else "MEDIUM"
            cursor.execute("""
                INSERT INTO alert_logs (bed_id, alert_type, severity, blocked_duration_mins)
                VALUES (?, ?, ?, ?)
            """, (data.bed_id, data.status, severity, 1 if data.status == "BLOCKED" else 0))
        else:
            if data.status == "BLOCKED":
                cursor.execute("""
                    UPDATE alert_logs SET blocked_duration_mins = blocked_duration_mins + 1
                    WHERE id = ?
                """, (existing[0],))
    elif data.status == "NORMAL":
        # Resolve active alerts if status returned to NORMAL
        cursor.execute("""
            UPDATE alert_logs SET resolved_at = CURRENT_TIMESTAMP
            WHERE bed_id = ? AND resolved_at IS NULL
        """, (data.bed_id,))

    conn.commit()
    conn.close()
    return {"status": "success"}

# --- Reset Bottle / Refill Endpoint (Clears Active Alerts) ---
@app.post("/api/beds/{bed_id}/reset-full")
def reset_bottle_full(bed_id: str):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT full_volume_ml, blynk_token FROM beds WHERE bed_id = ?", (bed_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Bed not found")

    full_vol, token = row[0], row[1]
    
    # 1. Reset Bed to NORMAL and 100% Volume
    cursor.execute("""
        UPDATE beds SET
            current_volume_ml = full_volume_ml,
            percentage = 100.0,
            status = 'NORMAL',
            last_updated = CURRENT_TIMESTAMP
        WHERE bed_id = ?
    """, (bed_id,))
    
    # 2. Immediately Resolve & Clear Active Alert Logs for this bed!
    cursor.execute("""
        UPDATE alert_logs SET resolved_at = CURRENT_TIMESTAMP
        WHERE bed_id = ? AND resolved_at IS NULL
    """, (bed_id,))

    conn.commit()
    conn.close()

    if token:
        try:
            requests.get(f"https://blynk.cloud/external/api/update?token={token}&V5=1", timeout=3)
        except Exception:
            pass

    return {"message": f"Bed {bed_id} reset to 100% full and alert cleared!", "full_volume_ml": full_vol}

@app.get("/api/alerts")
def get_alerts():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.id, a.bed_id, 
               COALESCE(b.patient_name, 'Patient') AS patient_name, 
               COALESCE(b.assigned_nurse, 'Nurse Aishani') AS assigned_nurse, 
               COALESCE(b.room_no, 'ICU Ward') AS room_no, 
               a.alert_type, a.severity, 
               a.created_at, a.blocked_duration_mins, a.acknowledged, a.acknowledged_by, a.acknowledged_at, a.resolved_at
        FROM alert_logs a
        LEFT JOIN beds b ON a.bed_id = b.bed_id
        ORDER BY a.id DESC LIMIT 50
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/alerts/acknowledge")
def acknowledge_alert(payload: AlertAcknowledge):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE alert_logs SET
            acknowledged = 1,
            acknowledged_by = ?,
            acknowledged_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (payload.nurse_name, payload.alert_id))
    conn.commit()
    conn.close()
    return {"message": f"Alert {payload.alert_id} acknowledged"}

@app.get("/api/reports/export-csv")
def export_clinical_report_csv():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            b.bed_id,
            b.patient_name,
            b.age_gender,
            b.doctor_name,
            b.assigned_nurse,
            b.room_no,
            b.fluid_type,
            b.current_volume_ml,
            b.full_volume_ml,
            b.flow_rate_mlm,
            b.tte_minutes,
            b.status,
            COALESCE(a.alert_type, 'NONE') AS last_alert_type,
            COALESCE(a.blocked_duration_mins, 0) AS blocked_duration_mins,
            COALESCE(a.acknowledged, 0) AS acknowledged,
            COALESCE(a.acknowledged_by, 'N/A') AS acknowledged_by,
            COALESCE(a.acknowledged_at, 'N/A') AS acknowledged_at,
            b.last_updated
        FROM beds b
        LEFT JOIN alert_logs a ON b.bed_id = a.bed_id
        ORDER BY b.bed_id ASC
    """)
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Bed ID", "Patient Name", "Age/Gender", "Attending Doctor", "Assigned Nurse",
        "Room No", "Fluid Type", "Current Volume (ml)", "Full Volume (ml)",
        "Infusion Flow Rate (ml/min)", "Est Time-To-Empty (mins)", "Status",
        "Last Alert Type", "Blocked Duration (mins)", "Nurse Informed / Ack Status", "Last Updated"
    ])

    for row in rows:
        r = dict(row)
        ack_str = f"Informed: Yes ({r['acknowledged_by']} at {r['acknowledged_at']})" if r['acknowledged'] == 1 else "Informed: Pending Nurse Ack"
        writer.writerow([
            r['bed_id'],
            r['patient_name'],
            r['age_gender'],
            r['doctor_name'],
            r['assigned_nurse'],
            r['room_no'],
            r['fluid_type'],
            f"{r['current_volume_ml']:.1f}",
            f"{r['full_volume_ml']:.1f}",
            f"{r['flow_rate_mlm']:.1f} ml/min",
            f"{r['tte_minutes']} mins",
            r['status'],
            r['last_alert_type'],
            f"{r['blocked_duration_mins']} mins",
            ack_str,
            r['last_updated']
        ])

    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=Flowguard_Clinical_Report.csv"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
