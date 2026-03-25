import urllib.request
import os

print("Downloading pre-trained face detection models...")

# Create models directory
os.makedirs('models', exist_ok=True)

# Download DNN face detection model (Caffe)
model_url = "https://raw.githubusercontent.com/opencv/opencv_3rdparty/dnn_samples_face_detector_20170830/res10_300x300_ssd_iter_140000.caffemodel"
config_url = "https://raw.githubusercontent.com/opencv/opencv/master/samples/dnn/face_detector/deploy.prototxt"

print("Downloading face detection model...")
urllib.request.urlretrieve(model_url, 'models/res10_300x300_ssd_iter_140000.caffemodel')
print("✓ Model downloaded")

print("Downloading model configuration...")
urllib.request.urlretrieve(config_url, 'models/deploy.prototxt')
print("✓ Configuration downloaded")

print("\n✅ All models downloaded successfully!")
print("Models saved in 'models/' directory")
