import cv2
import numpy as np
from collections import deque
import os

class AdvancedCheatingDetector:
    def __init__(self):
        # Initialize DNN face detector (much more accurate)
        model_file = 'models/res10_300x300_ssd_iter_140000.caffemodel'
        config_file = 'models/deploy.prototxt'
        
        if os.path.exists(model_file) and os.path.exists(config_file):
            self.net = cv2.dnn.readNetFromCaffe(config_file, model_file)
            self.use_dnn = True
            print("[INFO] Using DNN face detector (high accuracy)")
        else:
            self.use_dnn = False
            print("[WARNING] DNN models not found, using cascade detector")
        
        # Fallback: OpenCV cascades
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        self.eye_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_eye.xml'
        )
        self.profile_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_profileface.xml'
        )
        
        # History tracking for stable detection
        self.face_count_history = deque(maxlen=5)
        self.head_pose_history = deque(maxlen=10)
        
    def detect_faces_dnn(self, frame):
        """Detect faces using deep neural network (most accurate)"""
        h, w = frame.shape[:2]
        
        # Prepare image for DNN
        blob = cv2.dnn.blobFromImage(
            cv2.resize(frame, (300, 300)), 
            1.0, 
            (300, 300), 
            (104.0, 177.0, 123.0)
        )
        
        self.net.setInput(blob)
        detections = self.net.forward()
        
        face_count = 0
        faces = []
        
        # Loop through detections
        for i in range(detections.shape[2]):
            confidence = detections[0, 0, i, 2]
            
            # Filter weak detections (confidence threshold)
            if confidence > 0.5:  # 50% confidence
                face_count += 1
                
                # Get bounding box coordinates
                box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                (x, y, x2, y2) = box.astype("int")
                faces.append((x, y, x2-x, y2-y))
        
        return face_count, faces
    
    def detect_faces(self, frame):
        """Detect faces using multiple methods for better accuracy"""
        if self.use_dnn:
            # Use DNN detector (most accurate)
            face_count, faces = self.detect_faces_dnn(frame)
        else:
            # Fallback to cascade detector
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)
            
            # Frontal face detection
            frontal_faces = self.face_cascade.detectMultiScale(
                gray, 
                scaleFactor=1.1, 
                minNeighbors=4, 
                minSize=(40, 40),
                maxSize=(500, 500)
            )
            
            face_count = len(frontal_faces)
            faces = frontal_faces
        
        # Add to history for stability
        self.face_count_history.append(face_count)
        
        # Return median of recent history for stability
        if len(self.face_count_history) >= 3:
            stable_count = int(np.median(self.face_count_history))
            return stable_count, faces
        
        return face_count, faces
    
    def detect_head_pose(self, frame, faces):
        """Detect if student is looking away (left/right/down)"""
        if len(faces) == 0:
            return "no_face", 0
        
        # Get the largest face
        face = max(faces, key=lambda f: f[2] * f[3])
        x, y, w, h = face
        
        # Extract face region
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        face_roi = gray[y:y+h, x:x+w]
        
        # Detect eyes in face region
        eyes = self.eye_cascade.detectMultiScale(
            face_roi, 
            scaleFactor=1.1, 
            minNeighbors=5, 
            minSize=(20, 20)
        )
        
        if len(eyes) < 2:
            # Not enough eyes detected - might be looking away
            return "looking_away", 50
        
        # Calculate eye positions to determine gaze
        eye_centers = [(ex + ew//2, ey + eh//2) for ex, ey, ew, eh in eyes]
        
        if len(eye_centers) >= 2:
            # Sort eyes by x coordinate
            eye_centers.sort(key=lambda e: e[0])
            left_eye, right_eye = eye_centers[0], eye_centers[1]
            
            # Calculate face center
            face_center_x = w // 2
            eyes_center_x = (left_eye[0] + right_eye[0]) // 2
            
            # Calculate deviation
            deviation = abs(eyes_center_x - face_center_x)
            
            # Determine head pose based on eye position
            if deviation > 25:
                if eyes_center_x < face_center_x - 15:
                    return "looking_left", deviation
                elif eyes_center_x > face_center_x + 15:
                    return "looking_right", deviation
        
        return "looking_forward", 0
    
    def check_lighting(self, frame):
        """Check if lighting is too dark"""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness = np.mean(gray)
        
        if brightness < 50:
            return "too_dark", brightness
        elif brightness > 200:
            return "too_bright", brightness
        return "good", brightness
    
    def detect_face_mask(self, frame, faces):
        """Detect if person is wearing a face mask"""
        if len(faces) == 0:
            return False
        
        # Get the largest face
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        
        # Check lower half of face for mouth/nose visibility
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        lower_face = gray[y + h//2:y + h, x:x + w]
        
        # Detect if mouth region is obscured
        if lower_face.size > 0:
            std_dev = np.std(lower_face)
            mean_val = np.mean(lower_face)
            
            # Very uniform texture in lower face = possibly masked
            if std_dev < 25 and 40 < mean_val < 200:
                return True
        
        return False
    
    def comprehensive_check(self, frame):
        """Perform all checks and return detailed results"""
        results = {
            'face_count': 0,
            'head_pose': 'unknown',
            'head_deviation': 0,
            'lighting': 'unknown',
            'brightness': 0,
            'wearing_mask': False,
            'violations': []
        }
        
        # Check face count
        face_count, faces = self.detect_faces(frame)
        results['face_count'] = face_count
        
        # Check head pose (only if exactly 1 face)
        if face_count == 1:
            pose, deviation = self.detect_head_pose(frame, faces)
            results['head_pose'] = pose
            results['head_deviation'] = deviation
        elif face_count == 0:
            results['head_pose'] = 'no_face'
        else:
            results['head_pose'] = 'multiple_faces'
        
        # Check lighting
        lighting, brightness = self.check_lighting(frame)
        results['lighting'] = lighting
        results['brightness'] = brightness
        
        # Check for face mask (only if exactly 1 face)
        if face_count == 1:
            results['wearing_mask'] = self.detect_face_mask(frame, faces)
        
        # Determine violations
        if results['face_count'] == 0:
            results['violations'].append('No face detected')
        elif results['face_count'] > 1:
            results['violations'].append(f'Multiple faces detected ({results["face_count"]} faces)')
        
        if results['head_pose'] in ['looking_left', 'looking_right', 'looking_away']:
            if results['head_deviation'] > 30:
                results['violations'].append(f'Student looking away ({results["head_pose"]})')
        
        if results['lighting'] == 'too_dark':
            results['violations'].append('Poor lighting - face not clearly visible')
        
        if results['wearing_mask']:
            results['violations'].append('Face mask detected - identity verification required')
        
        return results

# Global detector instance
detector = None

def get_detector():
    global detector
    if detector is None:
        detector = AdvancedCheatingDetector()
    return detector
