/*
 * Flowguard-AI: Smart IV Fluid Monitoring & Alert System (ESP32 Node)
 * 
 * Hardware Wiring:
 * - Microcontroller: ESP32 (1 Node = 1 Saline Bed = 1 Blynk Auth Code)
 * - Load Cell ADC (HX711): DOUT -> GPIO 21, SCK -> GPIO 22
 * - OLED Display (SSD1306 128x64 I2C): SDA -> GPIO 18, SCL -> GPIO 19
 * - Tactile Reset / Tare Button: GPIO 4 (Internal Pullup, Active LOW)
 * - Local Sound Alert Buzzer: GPIO 5 (Active HIGH)
 * 
 * Features:
 * 1. Self-contained Captive WiFi & Blynk Provisioning Portal ("Flowguard-AP-Node" @ 192.168.4.1)
 * 2. Calibration Factor pre-set to 1064.4 (Measures in grams / ml)
 * 3. Short Button Press (< 1.5s): Set New Saline Bottle (100% Full Capacity Reset)
 * 4. Long Button Press (>= 1.5s): Zero-calibration Hook Tare (0.0g)
 * 5. Local SSD1306 OLED Telemetry & Warning Display
 * 6. Predictive Time-Series Flow Rate (ml/min) & Time-to-Empty (TTE in minutes)
 * 7. Real-Time Telemetry Sync with Blynk IoT Cloud (V0: Volume, V1: %, V2: Flow Rate, V3: TTE, V4: Status)
 */

#define BLYNK_TEMPLATE_ID "YOUR_TEMPLATE_ID"
#define BLYNK_TEMPLATE_NAME "Flowguard AI Bed Node"

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <BlynkSimpleEsp32.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Preferences.h>
#include "HX711.h"

// --- Pin Definitions ---
const int LOADCELL_DOUT_PIN = 21;
const int LOADCELL_SCK_PIN = 22;
const int OLED_SDA_PIN = 18;
const int OLED_SCL_PIN = 19;
const int BUTTON_PIN = 4;
const int BUZZER_PIN = 5;

// --- Calibration Factor ---
float calibration_factor = 1064.4;

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define DNS_PORT 53

// Objects
HX711 scale;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Preferences preferences;
BlynkTimer timer;
DNSServer dnsServer;
WebServer server(80);

// NVS Provisioning Credentials
String wifiSSID = "";
String wifiPASS = "";
String blynkToken = "";
bool isAPMode = false;

// System Telemetry Variables (in ml and ml/min)
float currentVolumeML = 0.0;
float fullVolumeML = 500.0; // Default 500ml saline bottle
float percentage = 100.0;
float flowRateMLM = 0.0;   // ml per minute
int tteMinutes = 0;        // Time To Empty in minutes
String flowState = "NORMAL";

// Rolling buffer for flow rate calculation (15 samples x 2s = 30s window)
const int BUFFER_SIZE = 15;
float volumeBuffer[BUFFER_SIZE];
int bufferIndex = 0;
bool bufferFilled = false;

// Button handling
unsigned long buttonPressTime = 0;
bool buttonActive = false;

// Function Declarations
void initHardware();
void setupCaptivePortal();
void handleCaptivePortalRoot();
void handleCaptivePortalSave();
void checkPhysicalButton();
void processSensors();
void calculateFlowAndTTE();
void updateOLED();
void setBottleFull();
void tareEmptyHook();
void triggerLocalBuzzer();
void sendBlynkTelemetry();

// Remote triggers from Blynk Cloud
BLYNK_WRITE(V5) {
  int value = param.asInt();
  if (value == 1) setBottleFull();
}

BLYNK_WRITE(V6) {
  int value = param.asInt();
  if (value == 1) tareEmptyHook();
}

BLYNK_WRITE(V7) {
  float vol = param.asFloat();
  if (vol > 10.0) {
    fullVolumeML = vol;
    preferences.putFloat("fullVol", fullVolumeML);
    if (currentVolumeML > 0) {
      percentage = min(100.0f, (currentVolumeML / fullVolumeML) * 100.0f);
    }
    Serial.print("Blynk Set Full Capacity: ");
    Serial.println(fullVolumeML);
  }
}

// Blynk Event Notification rate limiter
unsigned long lastEventTime = 0;
String lastEventCode = "";

void sendBlynkAlertEvent(const char* eventCode, const char* description) {
  if (isAPMode || WiFi.status() != WL_CONNECTED || !Blynk.connected()) return;
  unsigned long now = millis();
  if (String(eventCode) != lastEventCode || (now - lastEventTime > 60000)) {
    Blynk.logEvent(eventCode, description);
    lastEventCode = eventCode;
    lastEventTime = now;
    Serial.print("Blynk Event Triggered: ");
    Serial.println(eventCode);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n==========================================");
  Serial.println(" Flowguard-AI ESP32 Saline Bed Node v2.5 ");
  Serial.println("==========================================");

  initHardware();

  // Load preferences from non-volatile storage
  preferences.begin("flowguard", false);
  wifiSSID = preferences.getString("ssid", "");
  wifiPASS = preferences.getString("pass", "");
  blynkToken = preferences.getString("token", "");
  fullVolumeML = preferences.getFloat("fullVol", 500.0);

  // Check if WiFi credentials exist and attempt connection
  if (wifiSSID.length() > 0) {
    Serial.print("Connecting to Saved WiFi: ");
    Serial.println(wifiSSID);

    display.clearDisplay();
    display.setCursor(0, 15);
    display.println("Connecting WiFi...");
    display.setCursor(0, 35);
    display.println(wifiSSID);
    display.display();

    WiFi.mode(WIFI_STA);
    WiFi.begin(wifiSSID.c_str(), wifiPASS.c_str());

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 25) {
      delay(500);
      Serial.print(".");
      attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWiFi Connected successfully!");
      Serial.print("IP Address: ");
      Serial.println(WiFi.localIP());

      if (blynkToken.length() > 0) {
        Blynk.config(blynkToken.c_str());
        Blynk.connect(4000);
      }
    } else {
      Serial.println("\nWiFi Connection Failed! Launching Captive Portal...");
      setupCaptivePortal();
    }
  } else {
    Serial.println("No WiFi credentials found! Launching Captive Portal...");
    setupCaptivePortal();
  }

  // Setup sensor processing and cloud sync timers
  timer.setInterval(2000L, processSensors);
  timer.setInterval(4000L, sendBlynkTelemetry);
}

void loop() {
  if (isAPMode) {
    dnsServer.processNextRequest();
    server.handleClient();
  } else {
    if (WiFi.status() == WL_CONNECTED && blynkToken.length() > 0) {
      Blynk.run();
    }
    timer.run();
  }
  checkPhysicalButton();
}

void initHardware() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // Initialize Custom I2C for SSD1306 OLED (SDA=18, SCL=19)
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("WARNING: SSD1306 OLED not detected at 0x3C!");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(10, 20);
    display.println("Flowguard-AI Boot");
    display.display();
  }

  // Initialize HX711 Load Cell ADC
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  if (!scale.is_ready()) {
    Serial.println("CRITICAL: HX711 sensor not detected! Check wiring.");
  } else {
    scale.set_scale(calibration_factor);
    Serial.println("HX711 Scale initialized with factor 1064.4.");
  }
}

void setupCaptivePortal() {
  isAPMode = true;
  WiFi.mode(WIFI_AP);
  WiFi.softAP("Flowguard-AP-Setup", "12345678");

  IPAddress apIP = WiFi.softAPIP();
  Serial.print("AP Captive Portal Active at IP: ");
  Serial.println(apIP);

  dnsServer.start(DNS_PORT, "*", apIP);

  server.on("/", handleCaptivePortalRoot);
  server.on("/save", HTTP_POST, handleCaptivePortalSave);
  server.onNotFound(handleCaptivePortalRoot);
  server.begin();

  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 5);
  display.println("CAPTIVE WIFI PORTAL");
  display.drawLine(0, 16, 128, 16, SSD1306_WHITE);
  display.setCursor(0, 22);
  display.println("SSID: Flowguard-AP-Setup");
  display.setCursor(0, 34);
  display.println("Pass: 12345678");
  display.setCursor(0, 48);
  display.println("IP: 192.168.4.1");
  display.display();
}

void handleCaptivePortalRoot() {
  String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<style>body{font-family:sans-serif;background:#0f172a;color:#fff;padding:20px;margin:0;}";
  html += ".card{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);padding:24px;border-radius:16px;border:1px solid rgba(255,255,255,0.2);}";
  html += "h2{color:#38bdf8;margin-top:0;}input,select{width:100%;padding:12px;margin:8px 0 16px;border-radius:8px;border:none;box-sizing:border-box;}";
  html += "input[type='submit']{background:#0284c7;color:#fff;font-weight:bold;cursor:pointer;}";
  html += "</style></head><body><div class='card'>";
  html += "<h2>Flowguard-AI Node Setup</h2>";
  html += "<form action='/save' method='POST'>";
  html += "<label>WiFi Network Name (SSID):</label><input type='text' name='ssid' placeholder='Hospital_WiFi' required>";
  html += "<label>WiFi Password:</label><input type='password' name='pass' placeholder='Password'>";
  html += "<label>Blynk Auth Token:</label><input type='text' name='token' placeholder='Blynk Device Token' value='" + blynkToken + "'>";
  html += "<input type='submit' value='Save & Reboot Node'>";
  html += "</form></div></body></html>";

  server.send(200, "text/html", html);
}

void handleCaptivePortalSave() {
  if (server.hasArg("ssid")) wifiSSID = server.arg("ssid");
  if (server.hasArg("pass")) wifiPASS = server.arg("pass");
  if (server.hasArg("token")) blynkToken = server.arg("token");

  preferences.putString("ssid", wifiSSID);
  preferences.putString("pass", wifiPASS);
  preferences.putString("token", blynkToken);

  server.send(200, "text/html", "<html><body style='font-family:sans-serif;background:#0f172a;color:#38bdf8;padding:30px;'><h2>Credentials Saved!</h2><p>Rebooting Flowguard Node to connect...</p></body></html>");
  delay(2000);
  ESP.restart();
}

void processSensors() {
  if (scale.is_ready()) {
    float rawWeight = scale.get_units(5);
    if (rawWeight < 0 && rawWeight > -1.0) rawWeight = 0.0;
    
    // Saline Density 1.0 g = 1.0 ml
    currentVolumeML = rawWeight;

    if (fullVolumeML > 0) {
      percentage = (currentVolumeML / fullVolumeML) * 100.0;
      if (percentage > 100.0) percentage = 100.0;
      if (percentage < 0.0) percentage = 0.0;
    }

    calculateFlowAndTTE();
    updateOLED();
  } else {
    flowState = "SENSOR_ERR";
  }
}

void calculateFlowAndTTE() {
  volumeBuffer[bufferIndex] = currentVolumeML;
  bufferIndex = (bufferIndex + 1) % BUFFER_SIZE;
  if (bufferIndex == 0) bufferFilled = true;

  if (bufferFilled) {
    float oldestVol = volumeBuffer[bufferIndex];
    float deltaVol = oldestVol - currentVolumeML;
    
    // ml per minute (30 seconds = 0.5 mins)
    flowRateMLM = deltaVol / 0.5;
    if (flowRateMLM < 0) flowRateMLM = 0;

    if (flowRateMLM > 0.2) {
      tteMinutes = (int)(currentVolumeML / flowRateMLM);
    } else {
      tteMinutes = 999;
    }

    // Predictive Triage Anomaly Logic (Dynamic Capacity & False-Alarm Proof)
    float critVolThresh = max(15.0f, fullVolumeML * 0.15f);

    if (currentVolumeML <= 5.0 || percentage <= 2.0) {
      flowState = "EMPTY";
      triggerLocalBuzzer();
      sendBlynkAlertEvent("bottle_empty", "EMERGENCY: IV Saline Bottle is Empty! Replace bottle.");
    } else if (percentage >= 85.0 || currentVolumeML >= (fullVolumeML * 0.85)) {
      // Bottle Full Guard: Never trigger BLOCKED on full or freshly mounted bottles!
      flowState = "NORMAL";
    } else if (percentage <= 15.0 || currentVolumeML <= critVolThresh || (tteMinutes <= 5 && percentage <= 25.0)) {
      flowState = "CRITICAL_LOW";
      triggerLocalBuzzer();
      sendBlynkAlertEvent("critical_low", "WARNING: Saline Fluid Low (<15%)! Replacement needed soon.");
    } else if (flowRateMLM < 0.1 && percentage > 15.0 && currentVolumeML > 15.0) {
      flowState = "BLOCKED";
      triggerLocalBuzzer();
      sendBlynkAlertEvent("line_blocked", "ALERT: Infusion line blocked / occlusion detected!");
    } else {
      flowState = "NORMAL";
    }
  } else {
    flowState = "CALCULATING";
  }
}

void triggerLocalBuzzer() {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(120);
  digitalWrite(BUZZER_PIN, LOW);
}

void setBottleFull() {
  if (currentVolumeML > 10.0) {
    fullVolumeML = currentVolumeML;
    preferences.putFloat("fullVol", fullVolumeML);
    percentage = 100.0;
    flowState = "NORMAL";

    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(10, 15);
    display.println("BOTTLE RESET DONE!");
    display.setCursor(10, 35);
    display.print("Capacity: ");
    display.print(fullVolumeML, 1);
    display.println(" ml");
    display.display();
    delay(1500);
  }
}

void tareEmptyHook() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(10, 20);
  display.println("TARING HOOK (0.0g)...");
  display.display();
  scale.tare();
  delay(1200);
}

void checkPhysicalButton() {
  if (digitalRead(BUTTON_PIN) == LOW) {
    if (!buttonActive) {
      buttonActive = true;
      buttonPressTime = millis();
    }
  } else {
    if (buttonActive) {
      unsigned long duration = millis() - buttonPressTime;
      buttonActive = false;
      if (duration >= 1500) tareEmptyHook();
      else if (duration >= 50) setBottleFull();
    }
  }
}

void sendBlynkTelemetry() {
  if (!isAPMode && WiFi.status() == WL_CONNECTED && Blynk.connected()) {
    Blynk.virtualWrite(V0, currentVolumeML);
    Blynk.virtualWrite(V1, percentage);
    Blynk.virtualWrite(V2, flowRateMLM);
    Blynk.virtualWrite(V3, tteMinutes);
    Blynk.virtualWrite(V4, flowState);
  }
}

void updateOLED() {
  if (isAPMode) return;

  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("FLOWGUARD ");
  display.print(Blynk.connected() ? "[ONLINE]" : "[OFFLINE]");

  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);

  // Current Volume (ml)
  display.setTextSize(2);
  display.setCursor(0, 16);
  display.print(currentVolumeML, 1);
  display.setTextSize(1);
  display.print("ml");

  // Percentage (%)
  display.setTextSize(2);
  display.setCursor(76, 16);
  display.print((int)percentage);
  display.print("%");

  // Flow State
  display.setTextSize(1);
  display.setCursor(0, 38);
  display.print("STAT: ");
  display.print(flowState);

  // Flow Rate & TTE
  display.setCursor(0, 52);
  if (tteMinutes < 900) {
    display.print("TTE:");
    display.print(tteMinutes);
    display.print("m | ");
    display.print(flowRateMLM, 1);
    display.print("ml/m");
  } else {
    display.print("Rate: ");
    display.print(flowRateMLM, 1);
    display.print(" ml/m");
  }

  display.display();
}
