import os
import sys
import subprocess
import json
import time

STATE_FILE = "/tmp/stuck_pids.json"
LOG_FILE = "/home/swoller/ATE_DATA/stuck_monitor.log"
CPU_THRESHOLD = 50.0  # CPU usage threshold in %
STUCK_TIMEOUT_SECONDS = 2400  # 40 minutes

def log_message(msg):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {msg}\n"
    print(log_line.strip())
    try:
        with open(LOG_FILE, "a") as f:
            f.write(log_line)
    except Exception as e:
        print(f"Failed to write log: {e}")

def get_high_cpu_processes():
    try:
        output = subprocess.check_output(["ps", "-eo", "pid,pcpu,args"], encoding="utf-8", errors="ignore")
    except Exception as e:
        log_message(f"Error running ps command: {e}")
        return {}

    high_cpu_procs = {}
    lines = output.strip().split("\n")
    if not lines:
        return {}

    for line in lines[1:]:  # Skip header
        parts = line.strip().split(None, 2)
        if len(parts) < 3:
            continue
        try:
            pid = int(parts[0])
            pcpu = float(parts[1])
            args = parts[2]
            
            # Target run_osat_fetch tasks with high CPU load
            if "run_osat_fetch" in args and pcpu >= CPU_THRESHOLD:
                high_cpu_procs[pid] = {
                    "cpu": pcpu,
                    "args": args
                }
        except ValueError:
            continue
    return high_cpu_procs

def main():
    log_message("Starting stuck jobs check...")
    
    state = {}
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                state = json.load(f)
        except Exception as e:
            log_message(f"Error loading state file: {e}")

    current_procs = get_high_cpu_processes()
    log_message(f"Found {len(current_procs)} processes matching signature and CPU threshold.")

    new_state = {}
    killed_count = 0

    # Process currently active high-CPU processes
    for pid, info in current_procs.items():
        pid_str = str(pid)
        if pid_str in state:
            first_seen = state[pid_str]["first_seen"]
            elapsed = time.time() - first_seen
            if elapsed >= STUCK_TIMEOUT_SECONDS:
                log_message(f"Killing stuck process PID {pid} (elapsed: {elapsed:.1f}s, CPU: {info['cpu']}%, Cmd: {info['args']})")
                try:
                    subprocess.call(["kill", "-9", pid_str])
                    killed_count += 1
                except Exception as e:
                    log_message(f"Failed to kill process {pid}: {e}")
            else:
                # Keep tracking and retain original first_seen time
                log_message(f"Process PID {pid} is still high CPU (elapsed: {elapsed:.1f}s, CPU: {info['cpu']}%)")
                new_state[pid_str] = state[pid_str]
                # Update current CPU metrics in the state
                new_state[pid_str]["cpu"] = info["cpu"]
        else:
            log_message(f"Detected new high-CPU process PID {pid} (CPU: {info['cpu']}%, Cmd: {info['args']})")
            new_state[pid_str] = {
                "first_seen": time.time(),
                "cpu": info["cpu"],
                "args": info["args"]
            }

    # Save state
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(new_state, f)
    except Exception as e:
        log_message(f"Error saving state file: {e}")

    log_message(f"Check finished. Killed {killed_count} processes.")

if __name__ == "__main__":
    main()
