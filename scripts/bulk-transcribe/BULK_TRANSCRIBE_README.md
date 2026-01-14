# Bulk Transcription Script

This is a one-off script to transcribe all podcast episodes in S3 that don't already have transcriptions.

## Prerequisites

1. **AWS CLI configured with 'podcast' profile**:
   ```bash
   aws configure --profile podcast
   ```

2. **uv installed** (if not already installed):
   ```bash
   # macOS/Linux
   curl -LsSf https://astral.sh/uv/install.sh | sh
   
   # Or via homebrew
   brew install uv
   ```

## Usage

### Option 1: Run directly with uv (recommended)
```bash
cd bulk-transcribe
uv run bulk-transcribe.py
```

### Option 2: Create virtual environment and run
```bash
cd bulk-transcribe
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install boto3
python bulk-transcribe.py
```

## What it does

1. **Scans** `s3://aws-french-podcast-media/media/` for MP3 files
2. **Checks** `s3://aws-french-podcast-media/text/` for existing transcriptions
3. **Identifies** episodes that need transcription (MP3 exists but no transcription)
4. **Checks** for any currently running transcription jobs to avoid duplicates
5. **Starts** Amazon Transcribe jobs for missing transcriptions
6. **Saves** transcriptions to `s3://aws-french-podcast-media/text/` with naming pattern `{episode}-transcribe.json`

## Resume capability

The script can be safely interrupted and restarted. It will:
- Skip episodes that already have transcriptions
- Skip episodes that have pending transcription jobs
- Only process episodes that need transcription

## Output

- Transcription files are saved as: `text/{episode_number}-transcribe.json`
- Progress is shown in the console
- Summary statistics are displayed at the end

## Example output

```
🚀 Starting bulk transcription process...
📁 Scanning for MP3 files in media/ folder...
✅ Found 150 MP3 files
📄 Scanning for existing transcriptions in text/ folder...
✅ Found 120 existing transcriptions
⏳ Checking for pending transcription jobs...
✅ Found 5 pending transcription jobs

📊 Summary:
  Total MP3 episodes: 150
  Already transcribed: 120
  Currently processing: 5
  Need transcription: 25

🎯 Episodes to transcribe: 121, 122, 123, 124, 125 ... and 20 more

[1/25] Processing episode 121
🎤 Starting transcription job for episode 121...
✅ Started job bulk-transcribe-121-1704123456 for episode 121
```

## Notes

- Uses French language settings (`fr-FR`)
- No speaker labels (following the existing CDK workflow pattern)
- Minimal error handling (this is a one-off script)
- Small delays between job submissions to avoid rate limiting