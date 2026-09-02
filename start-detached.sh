#!/bin/bash
# Fully detached startup — daemonizes itself
nohup /home/z/my-project/run-dev.sh > /home/z/my-project/dev.log 2>&1 < /dev/null &
echo $! > /home/z/my-project/dev.pid
