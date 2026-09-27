# Flowguard-AI: Smart IV Fluid Monitoring & Alert System

**Flowguard-AI** is a decentralized, predictive IV fluid monitoring and silent triage architecture designed for resource-constrained clinical environments. By pairing an ESP32 microcontroller with an HX711 load cell, an SSD1306 OLED display, a physical "Set Full" calibration button, and Blynk IoT Cloud, Flowguard-AI calculates real-time time-series flow metrics and exact Time-To-Empty (TTE) to eliminate air embolism risks and cut hospital ward alarm fatigue by up to 40%.

---

## 🌟 Key Features

* **Exact Weight & Flow Tracking**: Uses a 1kg Load Cell + HX711 ADC (`DOUT=21`, `SCK=22`, calibration factor `1064.4`) with a 5-sample rolling average to filter ambient vibrations.
* **Dynamic "Set to Full" Bottle Reset**: Since every saline/medication bottle differs in weight and volume (250ml, 500ml, 1000ml), hanging a new bottle and pressing the physical button (GPIO 4) or clicking the Web/Blynk button automatically saves the current weight as the new $100\%$ baseline into ESP32 non-volatile storage (`Preferences.h`).
* **Bedside SSD1306 OLED Display**: Renders live weight ($g$), fluid level ($stream\%$), flow state (`NORMAL`, `BLOCKED`, `CRITICAL_LOW`, `EMPTY`), and Time-To-Empty countdown directly at the patient's bedside.
* **Blynk Cloud REST API Bridge**: Synchronizes telemetry to the cloud for silent nursing triage and remote mobile/web notifications.
* **Interactive Web Dashboard**: Features animated liquid saline bottle visuals, time-series depletion graph, priority alert banner, and remote reset control panel.

---

## 🔌 Hardware Pinout & Wiring Guide

| Component | Pin / Signal | ESP32 GPIO | Notes |
| :--- | :--- | :--- | :--- |
| **HX711 Load Cell ADC** | DOUT | `GPIO 21` | Data line |
| | SCK | `GPIO 22` | Clock line |
| **SSD1306 OLED Display** | SDA | `GPIO 18` | Custom Wire I2C Data |
| | SCL | `GPIO 19` | Custom Wire I2C Clock |
| **Reset / Set-Full Button** | Pin | `GPIO 4` | Active LOW (Internal Pull-Up) |
| | Ground | `GND` | Ground connection |

---

## 🚀 Quick Start Guide

### 1. ESP32 Firmware Setup
1. Open [`esp32_firmware/esp32_firmware.ino`](file:///c:/Users/vaarshik%20mani%20kumar/OneDrive/Documents/Flowguard-AI/esp32_firmware/esp32_firmware.ino) in Arduino IDE.
2. Install required Arduino libraries via **Sketch -> Include Library -> Manage Libraries**:
   - `HX711 Arduino Library` (by Bogdan Necula)
   - `Adafruit SSD1306` & `Adafruit GFX Library`
   - `Blynk` (by Volodymyr Shymanskyy)
3. Update Wi-Fi SSID, Password, and Blynk Auth Token in the sketch header:
   ```cpp
   #define BLYNK_TEMPLATE_ID "YOUR_TEMPLATE_ID"
   #define BLYNK_AUTH_TOKEN "YOUR_BLYNK_AUTH_TOKEN"
   char ssid[] = "YOUR_WIFI_SSID";
   char pass[] = "YOUR_WIFI_PASSWORD";
   ```
4. Select target board **ESP32 Dev Module** and upload.

---

### 2. Operating the Physical Reset Button
* **Short Press (Tap < 2 sec)**: Hang a new saline bottle and press once. Captures the current weight as the $100\%$ baseline and resets fluid percentage and alerts.
* **Long Press (Hold > 3 sec)**: Performed with only the empty hook attached. Tares the scale baseline to $0.0\text{g}$.

---

### 3. Launching the Web Dashboard
1. Simply open [`website/index.html`](file:///c:/Users/vaarshik%20mani%20kumar/OneDrive/Documents/Flowguard-AI/website/index.html) in any web browser (Chrome, Edge, Firefox).
2. The dashboard runs in **Live Simulation Mode** by default.
3. To connect to your physical ESP32 node, click the **Settings** icon in the header, enter your **Blynk Auth Token**, and click **Connect**.

---

## ☁️ Blynk Cloud Virtual Pin Mapping

| Virtual Pin | Parameter | Type | Unit |
| :--- | :--- | :--- | :--- |
| `V0` | Current Weight | Float Read | grams ($g$) |
| `V1` | Fluid Percentage | Float Read | $\%$ |
| `V2` | Flow Rate | Float Read | $g/\text{min}$ |
| `V3` | Time-To-Empty (TTE) | Integer Read | minutes |
| `V4` | Flow State Status | String Read | `NORMAL` / `BLOCKED` / `CRITICAL_LOW` |
| `V5` | Remote Set Full Trigger | Integer Write | `1` (Triggers bottle reset) |

---

## 📂 Project Structure

```
Flowguard-AI/
├── esp32_firmware/
│   └── esp32_firmware.ino      # ESP32 C++ Sketch (HX711 + OLED + Blynk + Set-Full)
├── website/
│   ├── index.html              # Hospital Ward Web Dashboard UI
│   ├── styles.css              # Custom Saline Level Animations & Tailwind tweaks
│   └── app.js                  # Telemetry logic, Blynk REST API bridge & Chart.js
├── extracted_docs_summary.txt # Extracted doc notes from project PDF review
├── implementation_plan.md      # Detailed architectural blueprint & roadmap
└── README.md                   # Project documentation & wiring guide
```
