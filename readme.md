# TRIPCHAIN

**Development of a travel-related mobile app to capture trip information and provide actionable mobility insights**  
*Theme:* Travel & Tourism | *Category:* Software  
*Problem Statement ID:* SIH25082 | *Team ID:* SIH54

---

## 🚀 Project Overview

TRIPCHAIN is a scalable, multilingual platform designed to capture, analyze, and visualize trip-related data from travelers. Unlike traditional navigation apps, TRIPCHAIN offers seamless trip-chain detection, auto bump detection using phone sensors, and anonymized data sharing to enable smarter, safer, and data-driven transport planning across India.

Our solution bridges the gap between manual surveys and real-time mobility insights, benefiting travelers, researchers, government agencies, and tourism boards.

---

## 🎯 Key Features

- **Trip Detection & Logging:** Automated trip segmentation and mode detection using GPS and sensor data  
- **Auto Bump Detection:** Uses gyroscope data to identify road anomalies (potholes, speed breakers), with GPS tagging and adjustable sensitivity  
- **Multilingual Support:** Integrated with Bhashini APIs for accessibility across India’s diverse languages  
- **Safety Features:** SOS integration connecting users to hospitals and police in emergencies  
- **Privacy-First:** Anonymized and encrypted data storage ensures user privacy  
- **Government Dashboard:** Visualizations, aggregated insights, and heatmaps for planners and researchers

---

## 🛠️ Tech Stack

| Layer            | Technology / Tools           |
|------------------|-----------------------------|
| Frontend         | React.js                    |
| Backend          | Node.js, Express.js          |
| Database         | MongoDB, Firebase            |
| Sensors & Detection | Gyroscope & GPS sensors     |
| Multilingual APIs| Bhashini Initiative          |
| Mapping & Visualization | Leaflet.js, Mapping APIs  |
| Hosting          | Cloud-based (AWS / GCP / Azure) |

---

## 📊 System Architecture
User App (React.js)
  ├─ Captures GPS and gyroscope sensor data
  ├─ Multilingual UI powered by Bhashini APIs
  └─ Detects trips & auto bump events (using gyroscope + GPS)

Backend (Node.js + Express.js)
  ├─ Processes trip chains and bump detection events
  ├─ Manages SOS routing and external API integrations
  └─ Stores anonymized data securely in MongoDB/Firebase

Government Dashboard (Web)
  ├─ Aggregates & visualizes trip and bump data
  └─ Provides actionable insights for transport policy & planning



---

## 📈 Impact & Use Cases

- **For Travelers & Tourists:** Smarter trip logging, safety tracking, and multilingual support  
- **For Researchers & Planners:** Access to anonymized, reliable trip and road condition data  
- **For Government & Tourism Boards:** Data-driven infrastructure investment and policy planning  
- **Future Potential:** Mandating app usage in government vehicles to improve daily road data accuracy nationwide

---

## 🏗️ Development & Deployment

- **MVP Timeline:** Functional prototype delivered within hackathon period  
- **Extended Roadmap:** Feature-rich version planned for 3–6 months post-MVP  
- **Cost:** Low-cost open-source tech stack, scalable cloud hosting  
- **Risk Mitigation:** Battery optimization through sensor sampling, offline data caching, explicit user consent for GPS access

---

## 👥 Team Members

| Name          | Role                         | Responsibilities                 |
|---------------|------------------------------|---------------------------------|
| Ark Agrawal   | Backend Development          | APIs, Databases                 |
| Adhish Gupta  | Backend Integration & Security| Integration, Security           |
| Navish Bharti | Frontend Development          | React.js, UI/UX                 |
| Raunak Singh  | Graphics & Visual Design      | Posters, Dashboards             |
| Kashvi Pundir | Documentation & Content       | Reports, References             |
| Riddhi Tanwar | Research & Testing            | Case Studies, Validation        |

---

## 📚 References

- NATPAC travel survey reports (Kerala)  
- Ministry of Road Transport & Highways reports  
- Smart Cities Mission transport planning  
- Bhashini Initiative (Govt. of India)  
- Google Mobility Reports & Citymapper studies  
- Leaflet.js and Mapping APIs  

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

## 📞 Contact

For questions, collaboration, or feedback, please reach out to the team via GitHub or email: arkagrawal.work@gmail.com

---

*“From journeys to insights, from insights to smarter planning.”*
