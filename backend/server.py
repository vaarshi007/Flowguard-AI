"""
Flowguard-AI Backend API & SQLite Database Server

Features:
- Volume in ml and Flow Rate in ml/min.
- Bed Node Management (Add, Update, Discharge/Remove Bed).
- CSV / Excel Clinical Audit Report Exporter (detailed patient infusion logs, flow rates, occlusion duration, alert informed status).
- 1 ESP32 Hardware Node = 1 Saline Bed = 1 Blynk Auth Code mapping.
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
    description="Backend Server & SQLite Database for IV Fluid Monitoring",
    version="1.1.0"
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

    # Beds Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS beds (
            bed_id TEXT PRIMARY KEY,
            patient_name TEXT NOT NULL,
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

    # Alert Audit Logs Table
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

    # Seed initial beds if empty
    cursor.execute("SELECT COUNT(*) FROM beds")
    if cursor.fetchone()[0] == 0:
        default_beds = [
            ("ICU-01", "A. Sharma (Bed 104)", "ICU Room 104", "Saline 0.9% (500ml)", 500.0, 442.5, 88.5, 4.6, 96, "NORMAL", "DEMO_TOKEN_1"),
            ("ICU-02", "R. Verma (Bed 108)", "ICU Room 108", "Dextrose 5% (500ml)", 500.0, 22.0, 4.4, 5.1, 4, "CRITICAL_LOW", "DEMO_TOKEN_2"),
            ("ICU-03", "K. Patel (Bed 112)", "ICU Room 112", "Ringer's Lactate (1000ml)", 1000.0, 780.0, 78.0, 0.0, 999, "BLOCKED", "DEMO_TOKEN_3")
        ]
        cursor.executemany("""
            INSERT INTO beds (bed_id, patient_name, room_no, fluid_type, full_volume_ml, current_volume_ml, percentage, flow_rate_mlm, tte_minutes, status, blynk_token)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, default_beds)
        conn.commit()

    conn.close()

init_db()

class BedCreate(BaseModel):
    bed_id: str
    patient_name: str
    room_no: str
    fluid_type: str
    full_volume_ml: float = 500.0
    blynk_token: Optional[str] = ""

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

@app.get("/api/health")
def health_check():
    return {"status": "online", "database": "sqlite", "version": "1.1.0"}

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
        INSERT INTO beds (bed_id, patient_name, room_no, fluid_type, full_volume_ml, current_volume_ml, percentage, blynk_token, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, 100.0, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(bed_id) DO UPDATE SET
            patient_name=excluded.patient_name,
            room_no=excluded.room_no,
            fluid_type=excluded.fluid_type,
            full_volume_ml=excluded.full_volume_ml,
            blynk_token=excluded.blynk_token,
            last_updated=CURRENT_TIMESTAMP
    """, (bed.bed_id, bed.patient_name, bed.room_no, bed.fluid_type, bed.full_volume_ml, bed.full_volume_ml, bed.blynk_token))
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

    conn.commit()
    conn.close()
    return {"status": "success"}

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
    
    cursor.execute("""
        UPDATE beds SET
            current_volume_ml = full_volume_ml,
            percentage = 100.0,
            status = 'NORMAL',
            last_updated = CURRENT_TIMESTAMP
        WHERE bed_id = ?
    """, (bed_id,))
    
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

    return {"message": f"Bed {bed_id} reset to 100% full", "full_volume_ml": full_vol}

@app.get("/api/alerts")
def get_alerts():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.id, a.bed_id, b.patient_name, b.room_no, a.alert_type, a.severity, 
               a.created_at, a.blocked_duration_mins, a.acknowledged, a.acknowledged_by, a.acknowledged_at
        FROM alert_logs a
        JOIN beds b ON a.bed_id = b.bed_id
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

# --- Export CSV / Excel Clinical Audit Report Endpoint ---
@app.get("/api/reports/export-csv")
def export_clinical_report_csv():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            b.bed_id,
            b.patient_name,
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

    # Headers
    writer.writerow([
        "Bed ID", "Patient Name", "Room No", "Fluid Type",
        "Current Volume (ml)", "Full Volume (ml)", "Infusion Flow Rate (ml/min)",
        "Est Time-To-Empty (mins)", "Current Status", "Alert Type",
        "Blocked Duration (mins)", "Informed / Nurse Ack Status", "Last Recorded Time"
    ])

    for row in rows:
        r = dict(row)
        ack_str = f"Informed: Yes ({r['acknowledged_by']} at {r['acknowledged_at']})" if r['acknowledged'] == 1 else "Informed: Pending Nurse Ack"
        writer.writerow([
            r['bed_id'],
            r['patient_name'],
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
