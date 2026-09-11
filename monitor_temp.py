import serial, time
s = serial.Serial('COM8', 115200, timeout=1)
t = time.time() + 10
while time.time() < t:
    line = s.readline()
    if line:
        print(line.decode('utf-8', errors='replace'), end='')
s.close()
