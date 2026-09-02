#!/bin/bash
# Start the Next.js dev server in a fully detached session.
# The script is invoked via setsid so the server survives the parent shell exit.
cd /home/z/my-project
export DATABASE_URL="postgresql://neondb_owner:npg_tjaDHGg7ms3c@ep-quiet-breeze-b1x58rmg-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require"
exec /home/z/my-project/node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
