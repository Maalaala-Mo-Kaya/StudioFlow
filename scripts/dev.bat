@echo off

echo Starting Highlight Server...

npm run dev
pocketbase --port 8090 
