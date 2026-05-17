import cv2
import subprocess
result = subprocess.run(['ffmpeg', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], capture_output=True, text=True)
print(result.stderr)

for i in range(5):
    cap = cv2.VideoCapture(i)
    if cap.isOpened():
        print(f'Camera {i}: available')
        cap.release()
    else:
        print(f'Camera {i}: not available')