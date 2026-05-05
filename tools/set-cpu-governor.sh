#!/bin/bash
GOVERNOR="${1:-performance}"
for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
  echo "$GOVERNOR" > "$f"
done
echo "CPU governor impostato a: $GOVERNOR"
