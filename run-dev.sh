#!/bin/bash
export DATABASE_URL="postgresql://neondb_owner:npg_tjaDHGg7ms3c@ep-quiet-breeze-b1x58rmg-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require"
cd /home/z/my-project
exec ./node_modules/.bin/next dev -p 3000
