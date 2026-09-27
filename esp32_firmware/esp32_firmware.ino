/*
 * Flowguard-AI: Smart IV Fluid Monitoring & Alert System
 * 
 * Hardware Setup:
 * - Microcontroller: ESP32 (1 Node = 1 Saline Bed = 1 Blynk Auth Code)
 * - Load Cell ADC: HX711 (DOUT -> GPIO 21, SCK -> GPIO 22)
 * - OLED Display: SSD1306 128x64 I2C (SDA -> GPIO 18, SCL -> GPIO 19)
 * - Reset / Set-Full Button: GPIO 4 (Internal Pullup, Active LOW)
 * - Optional Sound Alert Buzzer: GPIO 5
 * - Units: Volume in ml, Flow Rate in ml/min (Saline density = 1.0 g/ml)
 */

#define BLYNK_TEMPLATE_ID "YOUR_TEMPLATE_ID"
#define BLYNK_TEMPLATE_NAME "Flowguard AI Bed Node"
#define BLYNK_AUTH_TOKEN "YOUR_BLYNK_AUTH_TOKEN"

#include <WiFi.h>
#include <WiFiClient.h>
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

// --- Calibration & Hardware Parameters ---
float calibration_factor = 1064.4;
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

// Objects
HX711 scale;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Preferences preferences;
BlynkTimer timer;

// Wi-Fi Credentials
char auth[] = BLYNK_AUTH_TOKEN;
char ssid[] = "YOUR_WIFI_SSID";
char pass[] = "YOUR_WIFI_PASSWORD";

// --- System State Variables (Units in ml and ml/min) ---
float currentVolumeML = 0.0;
float fullVolumeML = 500.0; // Default 500ml bottle
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

void updateOLED();
void calculateFlowAndTTE();
void setBottleFull();
void tareEmptyHook();
void triggerLocalBuzzer();

// Blynk virtual pin write handler (Remote Reset from Website/App)
BLYNK_WRITE(V5) {
  int value = param.asInt();
  if (value == 1) {
    setBottleFull();
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=================================");
  Serial.println(" Flowguard-AI Node Initializing ");
  Serial.println("=================================");

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // Initialize Custom I2C for OLED (SDA=18, SCL=19)
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 OLED allocation failed!");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(10, 20);
    display.println("Flowguard-AI Booting");
    display.display();
  }

  // Load stored fullVolumeML from non-volatile storage
  preferences.begin("flowguard", false);
  fullVolumeML = preferences.getFloat("fullVolumeML", 500.0);

  // Initialize HX711
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  if (!scale.is_ready()) {
    Serial.println("CRITICAL: HX711 not detected!");
  } else {
    scale.set_scale(calibration_factor);
    Serial.println("HX711 scale initialized.");
  }

  // Connect to Blynk Cloud
  Blynk.begin(auth, ssid, pass);

  // Setup periodic timers
  timer.setInterval(2000L, processSensors);
  timer.setInterval(5000L, sendBlynkTelemetry);
}

void loop() {
  Blynk.run();
  timer.run();
  checkPhysicalButton();
}

void processSensors() {
  if (scale.is_ready()) {
    float rawWeight = scale.get_units(5);
    if (rawWeight < 0 && rawWeight > -1.0) rawWeight = 0.0;
    
    // 1 gram of Saline = 1.0 ml
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

    // --- Predictive Anomaly Logic ---
    if (currentVolumeML <= 10.0 || percentage <= 3.0) {
      flowState = "EMPTY";
      triggerLocalBuzzer();
    } else if (percentage <= 15.0 || tteMinutes <= 5) {
      flowState = "CRITICAL_LOW";
      triggerLocalBuzzer();
    } else if (flowRateMLM < 0.1 && percentage > 15.0) {
      flowState = "BLOCKED";
      triggerLocalBuzzer();
    } else {
      flowState = "NORMAL";
    }
  } else {
    flowState = "CALCULATING";
  }
}

void triggerLocalBuzzer() {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(100);
  digitalWrite(BUZZER_PIN, LOW);
}

void setBottleFull() {
  if (currentVolumeML > 10.0) {
    fullVolumeML = currentVolumeML;
    preferences.putFloat("fullVolumeML", fullVolumeML);
    percentage = 100.0;
    flowState = "NORMAL";

    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(10, 20);
    display.println("BOTTLE RESET DONE!");
    display.setCursor(10, 40);
    display.print("Full: ");
    display.print(fullVolumeML, 1);
    display.println(" ml");
    display.display();
    delay(1500);
  }
}

void tareEmptyHook() {
  display.clearDisplay();
  display.setCursor(10, 20);
  display.println("TARING HOOK...");
  display.display();
  scale.tare();
  delay(1000);
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
      if (duration >= 3000) tareEmptyHook();
      else if (duration >= 50) setBottleFull();
    }
  }
}

void sendBlynkTelemetry() {
  if (Blynk.connected()) {
    Blynk.virtualWrite(V0, currentVolumeML);
    Blynk.virtualWrite(V1, percentage);
    Blynk.virtualWrite(V2, flowRateMLM);
    Blynk.virtualWrite(V3, tteMinutes);
    Blynk.virtualWrite(V4, flowState);
  }
}

void updateOLED() {
  display.clearDisplay();

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("FLOWGUARD ");
  display.print(Blynk.connected() ? "[ONLINE]" : "[OFF]");

  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);

  display.setTextSize(2);
  display.setCursor(0, 16);
  display.print(currentVolumeML, 1);
  display.setTextSize(1);
  display.print("ml");

  display.setTextSize(2);
  display.setCursor(75, 16);
  display.print((int)percentage);
  display.print("%");

  display.setTextSize(1);
  display.setCursor(0, 38);
  display.print("STAT: ");
  display.print(flowState);

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
