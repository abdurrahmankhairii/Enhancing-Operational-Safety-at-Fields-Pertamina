# Enhancing Operational Safety at Fields Pertamina: An Integrated AI System for Identity and PPE Verification

## Overview
This project develops an integrated AI system to enhance operational safety at Pertamina's oil and gas fields by implementing real-time identity verification and Personal Protective Equipment (PPE) detection. Utilizing the SH17 Dataset for PPE Detection from Kaggle, the system combines object detection for PPE compliance (e.g., helmets, gloves, vests, boots) with identity verification to ensure only authorized personnel access high-risk areas. Powered by machine learning models and exposed through a FastAPI backend, the system aims to:
- Reduce workplace accidents.
- Enforce safety protocols.
- Improve operational efficiency in Pertamina's field operations.

## Table of Contents
- [Overview](#overview)
- [Dataset](#dataset)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Model Training](#model-training)
- [API Endpoints](#api-endpoints)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Dataset
### SH17 Dataset from Kaggle
- **Used for**: PPE detection.
- **Key Details**:
  - Contains annotated images for object detection (refer to Kaggle for exact size).
  - Format: Images with XML/JSON annotations for bounding boxes.
  - Usage: Suitable for training object detection models (e.g., YOLO, Faster R-CNN).
- **Download Instructions**:
  1. Install the Kaggle API: `pip install kaggle`
  2. Set up your Kaggle API key (download from Kaggle account and place in `~/.kaggle/kaggle.json`).
  3. Run: `kaggle datasets download -d mugheesahmad/sh17-dataset-for-ppe-detection`
  4. Unzip the dataset into the `data/` directory.

### Identity Verification Dataset
- The system assumes integration with a proprietary or custom dataset of employee images/facial features (not included in this repository).
- To prepare: Place authorized personnel images in `data/identity/` and configure paths in `config.py` or relevant scripts.

## Features
- Real-time PPE detection using a trained object detection model.
- AI-based identity verification for authorized personnel access.
- FastAPI backend for seamless integration with safety systems.
- Safety analytics with reports and dashboards.
- Automated alerts for non-compliance or unauthorized access.
- Compatibility with CCTV systems for field monitoring.

## Requirements
- Python 3.10+
- Anaconda for environment management
- GPU recommended (CUDA-enabled for PyTorch/TensorFlow)
- Access to a facial recognition dataset (not provided)

## Installation
### Step 1: Install Anaconda
Download from [https://www.anaconda.com/products/distribution](https://www.anaconda.com/products/distribution).

### Step 2: Create a New Conda Environment
```bash
conda create -n ppe-identity-safety python=3.10
conda activate ppe-identity-safety
```

### Step 3: Install Dependencies
```bash
conda install pytorch torchvision torchaudio cudatoolkit=11.3 -c pytorch  # Adjust for GPU/CPU
pip install fastapi uvicorn opencv-python pillow numpy pandas matplotlib
pip install ultralytics  # For YOLO models
pip install kaggle
pip install face_recognition  # For identity verification
```

### Step 4: Clone the Repository
```bash
git clone https://github.com/abdurrahmankhairii/Enhancing-Operational-Safety-at-Fields-Pertamina.git
cd Enhancing-Operational-Safety-at-Fields-Pertamina
```

### Step 5: Download Dataset
### Step 5: Download Dataset
Follow the [SH17 Dataset](#sh17-dataset-from-kaggle) download instructions from the main README.

### Step 6: Setup Identity Verification Dataset
- Place authorized personnel images in `data/identity/` (ensure proper naming or database setup).
- Update `config.py` or relevant scripts with paths to the identity dataset.

## Usage
### Running the FastAPI Application
1. Activate the environment:
   ```bash
   conda activate ppe-identity-safety
   ```

2. Run the server:
   ```bash
   uvicorn main:app --reload
   ```

3. Access the API: http://127.0.0.1:8000/docs


### Example API Usage
#### PPE Detection
```python
import requests

url = "http://127.0.0.1:8000/detect-ppe"
files = {'file': open('path/to/image.jpg', 'rb')}
response = requests.post(url, files=files)
print(response.json())
```

#### Identity Verification
```python
import requests

url = "http://127.0.0.1:8000/verify-identity"
files = {'file': open('path/to/face_image.jpg', 'rb')}
response = requests.post(url, files=files)
print(response.json())
```

## Model Training
### PPE Detection
1. Prepare the SH17 dataset in `data/ppe/`.
2. Run: `python train_ppe.py`
3. Save model weights to `models/ppe_model.pt`.

### Identity Verification
1. Prepare the identity dataset in `data/identity/`.
2. Run: `python train_identity.py`
3. Save face encodings to `models/identity_model`.

## API Endpoints
- **POST /detect-ppe**: Upload an image/video to detect PPE items.
- **POST /verify-identity**: Upload an image to verify identity.
- **GET /analytics**: Retrieve safety compliance reports.

## Contributing
1. Fork the repository.
2. Create a branch (`git checkout -b feature-branch`).
3. Commit changes (`git commit -m 'Add new feature'`).
4. Push to the branch (`git push origin feature-branch`).
5. Open a pull request.

## License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Contact
- **Author**: Abdurrahman Khairii
- **Email**: [abdurrahmankhairi17@gmail.com](mailto:abdurrahmankhairi17@gmail.com)
- **GitHub**: [abdurrahmankhairii](https://github.com/abdurrahmankhairii)


   
