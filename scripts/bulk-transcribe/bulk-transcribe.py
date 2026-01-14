#!/usr/bin/env uv run
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "boto3>=1.26.0",
# ]
# ///
"""
One-off script to transcribe all podcast episodes in S3 that don't already have transcriptions.
This script can be resumed if interrupted.

Usage: uv run bulk-transcribe.py

Requirements:
- AWS CLI configured with 'podcast' profile
- uv installed
"""

import boto3
import json
import time
import sys
from datetime import datetime
from typing import Set, List, Dict

# Configuration
BUCKET_NAME = 'aws-french-podcast-media'
MEDIA_PREFIX = 'media/'
TEXT_PREFIX = 'text/'
REGION = 'eu-central-1'
LANGUAGE_CODE = 'fr-FR'
MEDIA_FORMAT = 'mp3'

# Initialize AWS clients with podcast profile
session = boto3.Session(profile_name='podcast')
s3_client = session.client('s3', region_name=REGION)
transcribe_client = session.client('transcribe', region_name=REGION)

def get_existing_mp3_files() -> Set[str]:
    """Get all MP3 files in the media/ folder."""
    print("📁 Scanning for MP3 files in media/ folder...")
    
    mp3_files = set()
    paginator = s3_client.get_paginator('list_objects_v2')
    
    for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=MEDIA_PREFIX):
        if 'Contents' in page:
            for obj in page['Contents']:
                key = obj['Key']
                if key.endswith('.mp3') and key != MEDIA_PREFIX:
                    # Extract episode number from filename (e.g., "media/123.mp3" -> "123")
                    filename = key.replace(MEDIA_PREFIX, '')
                    episode_number = filename.replace('.mp3', '')
                    mp3_files.add(episode_number)
    
    print(f"✅ Found {len(mp3_files)} MP3 files")
    return mp3_files

def get_existing_transcriptions() -> Set[str]:
    """Get all existing transcription files in the text/ folder."""
    print("📄 Scanning for existing transcriptions in text/ folder...")
    
    transcriptions = set()
    paginator = s3_client.get_paginator('list_objects_v2')
    
    for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=TEXT_PREFIX):
        if 'Contents' in page:
            for obj in page['Contents']:
                key = obj['Key']
                if key.endswith('-transcribe.json') and key != TEXT_PREFIX:
                    # Extract episode number from filename (e.g., "text/123-transcribe.json" -> "123")
                    filename = key.replace(TEXT_PREFIX, '')
                    episode_number = filename.replace('-transcribe.json', '')
                    transcriptions.add(episode_number)
    
    print(f"✅ Found {len(transcriptions)} existing transcriptions")
    return transcriptions

def get_pending_transcription_jobs() -> Set[str]:
    """Get all currently running or queued transcription jobs."""
    print("⏳ Checking for pending transcription jobs...")
    
    pending_jobs = set()
    
    try:
        # Get all transcription jobs (running, queued, completed, failed)
        paginator = transcribe_client.get_paginator('list_transcription_jobs')
        
        for page in paginator.paginate():
            for job in page['TranscriptionJobSummaries']:
                job_name = job['TranscriptionJobName']
                status = job['TranscriptionJobStatus']
                
                # If job is still running or queued, extract episode number
                if status in ['IN_PROGRESS', 'QUEUED']:
                    # Job names should be in format like "bulk-transcribe-123-timestamp"
                    if job_name.startswith('bulk-transcribe-'):
                        parts = job_name.split('-')
                        if len(parts) >= 3:
                            episode_number = parts[2]  # Extract episode number
                            pending_jobs.add(episode_number)
                            print(f"  📋 Found pending job for episode {episode_number}: {status}")
    
    except Exception as e:
        print(f"⚠️  Warning: Could not check pending jobs: {e}")
    
    print(f"✅ Found {len(pending_jobs)} pending transcription jobs")
    return pending_jobs

def start_transcription_job(episode_number: str) -> bool:
    """Start a transcription job for the given episode."""
    
    # Generate unique job name with timestamp
    timestamp = int(time.time())
    job_name = f"bulk-transcribe-{episode_number}-{timestamp}"
    
    media_uri = f"s3://{BUCKET_NAME}/{MEDIA_PREFIX}{episode_number}.mp3"
    output_key = f"{TEXT_PREFIX}{episode_number}-transcribe.json"
    
    try:
        print(f"🎤 Starting transcription job for episode {episode_number}...")
        
        response = transcribe_client.start_transcription_job(
            TranscriptionJobName=job_name,
            LanguageCode=LANGUAGE_CODE,
            MediaFormat=MEDIA_FORMAT,
            Media={
                'MediaFileUri': media_uri
            },
            OutputBucketName=BUCKET_NAME,
            OutputKey=output_key,
            Settings={
                'ShowSpeakerLabels': False
            }
        )
        
        print(f"✅ Started job {job_name} for episode {episode_number}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to start transcription job for episode {episode_number}: {e}")
        return False

def main():
    """Main execution function."""
    print("🚀 Starting bulk transcription process...")
    print(f"📅 Started at: {datetime.now().isoformat()}")
    print(f"🪣 Bucket: {BUCKET_NAME}")
    print(f"🌍 Region: {REGION}")
    print()
    
    try:
        # Step 1: Get all MP3 files
        mp3_episodes = get_existing_mp3_files()
        if not mp3_episodes:
            print("❌ No MP3 files found in media/ folder")
            return
        
        # Step 2: Get existing transcriptions
        existing_transcriptions = get_existing_transcriptions()
        
        # Step 3: Get pending transcription jobs
        pending_jobs = get_pending_transcription_jobs()
        
        # Step 4: Calculate episodes that need transcription
        episodes_to_transcribe = mp3_episodes - existing_transcriptions - pending_jobs
        
        print()
        print("📊 Summary:")
        print(f"  Total MP3 episodes: {len(mp3_episodes)}")
        print(f"  Already transcribed: {len(existing_transcriptions)}")
        print(f"  Currently processing: {len(pending_jobs)}")
        print(f"  Need transcription: {len(episodes_to_transcribe)}")
        print()
        
        if not episodes_to_transcribe:
            print("✅ All episodes are already transcribed or being processed!")
            return
        
        # Sort episodes for consistent processing order
        episodes_list = sorted(episodes_to_transcribe, key=lambda x: int(x) if x.isdigit() else float('inf'))
        
        print(f"🎯 Episodes to transcribe: {', '.join(episodes_list[:10])}" + 
              (f" ... and {len(episodes_list)-10} more" if len(episodes_list) > 10 else ""))
        print()
        
        # Step 5: Start transcription jobs
        successful_jobs = 0
        failed_jobs = 0
        
        for i, episode_number in enumerate(episodes_list, 1):
            print(f"[{i}/{len(episodes_list)}] Processing episode {episode_number}")
            
            if start_transcription_job(episode_number):
                successful_jobs += 1
                # Small delay to avoid rate limiting
                time.sleep(1)
            else:
                failed_jobs += 1
            
            # Progress update every 10 jobs
            if i % 10 == 0:
                print(f"📈 Progress: {i}/{len(episodes_list)} jobs submitted")
                print(f"   ✅ Successful: {successful_jobs}, ❌ Failed: {failed_jobs}")
                print()
        
        print()
        print("🏁 Bulk transcription job submission completed!")
        print(f"✅ Successfully started: {successful_jobs} jobs")
        print(f"❌ Failed to start: {failed_jobs} jobs")
        print(f"📅 Completed at: {datetime.now().isoformat()}")
        
        if successful_jobs > 0:
            print()
            print("⏳ Transcription jobs are now running in the background.")
            print("   You can monitor progress in the AWS Transcribe console.")
            print("   Transcriptions will be saved to s3://aws-french-podcast-media/text/")
            print("   You can re-run this script to process any remaining episodes.")
        
    except KeyboardInterrupt:
        print("\n⚠️  Script interrupted by user")
        print("   You can safely re-run this script to continue where you left off.")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        print("   You can re-run this script to retry.")
        sys.exit(1)

if __name__ == "__main__":
    main()