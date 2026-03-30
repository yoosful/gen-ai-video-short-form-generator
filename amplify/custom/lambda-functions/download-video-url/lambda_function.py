import json
import boto3
import subprocess
import os

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    """
    Download video from URL using yt-dlp and upload to S3.
    This triggers the existing video processing pipeline via S3 event.
    """
    # Get parameters from event (passed from resolver) or environment
    bucket_name = event.get('bucketName') or os.environ.get("BUCKET_NAME")
    history_table_name = event.get('historyTableName') or os.environ.get("HISTORY_TABLE_NAME")

    video_url = event['videoUrl']
    video_id = event['uuid']
    video_name = event.get('videoName', 'downloaded-video')

    # Download directory (Lambda /tmp has up to 10GB with ephemeral storage)
    download_path = f"/tmp/{video_id}"
    os.makedirs(download_path, exist_ok=True)
    output_file = f"{download_path}/RAW.mp4"

    history_table = dynamodb.Table(history_table_name)

    try:
        # Use yt-dlp to download video
        yt_dlp_path = '/opt/python/bin/yt-dlp'

        # Download video with bot detection workarounds
        result = subprocess.run([
            yt_dlp_path,
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '-o', output_file,
            '--no-playlist',
            '--max-filesize', '2G',  # 2GB limit as decided
            '--no-warnings',
            '--no-progress',
            # Bot detection workarounds for YouTube
            '--extractor-args', 'youtube:player_client=ios,web',
            '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            '--sleep-requests', '1',
            video_url
        ], capture_output=True, text=True, timeout=840)  # 14 min timeout

        # Try to download subtitles (YouTube auto-captions or manual)
        subtitle_file = f"{download_path}/subtitle"
        subtitle_result = subprocess.run([
            yt_dlp_path,
            '--write-auto-sub',
            '--write-sub',
            '--sub-lang', 'en,ko,en-US,ko-KR',
            '--sub-format', 'vtt',
            '--skip-download',
            '-o', subtitle_file,
            '--no-playlist',
            '--no-warnings',
            '--extractor-args', 'youtube:player_client=ios,web',
            '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            video_url
        ], capture_output=True, text=True, timeout=120)

        print(f"Subtitle download result: {subtitle_result.returncode}")
        print(f"Subtitle stderr: {subtitle_result.stderr}")

        if result.returncode != 0:
            error_msg = result.stderr or result.stdout or "Unknown yt-dlp error"
            print(f"yt-dlp stderr: {result.stderr}")
            print(f"yt-dlp stdout: {result.stdout}")
            raise Exception(f"yt-dlp error: {error_msg}")

        # Check if file exists and get size
        if not os.path.exists(output_file):
            raise Exception("Download completed but output file not found")

        file_size = os.path.getsize(output_file)
        print(f"Downloaded video: {file_size} bytes")

        # Upload to S3
        s3_key = f"videos/{video_id}/RAW.mp4"
        print(f"Uploading to s3://{bucket_name}/{s3_key}")

        s3.upload_file(
            output_file,
            bucket_name,
            s3_key,
            ExtraArgs={'ContentType': 'video/mp4'}
        )

        print(f"Upload complete: {s3_key}")

        # Upload subtitle if downloaded
        subtitle_uploaded = False
        for lang in ['en', 'ko', 'en-US', 'ko-KR']:
            vtt_file = f"{subtitle_file}.{lang}.vtt"
            if os.path.exists(vtt_file):
                subtitle_s3_key = f"videos/{video_id}/Transcript.vtt"
                s3.upload_file(
                    vtt_file,
                    bucket_name,
                    subtitle_s3_key,
                    ExtraArgs={'ContentType': 'text/vtt'}
                )
                print(f"Subtitle uploaded: {subtitle_s3_key} (lang: {lang})")
                subtitle_uploaded = True
                os.remove(vtt_file)
                break  # Use first available language

        # Clean up any remaining subtitle files
        import glob
        for f in glob.glob(f"{subtitle_file}*.vtt"):
            try:
                os.remove(f)
            except:
                pass

        # Clean up local file
        os.remove(output_file)
        os.rmdir(download_path)

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Video downloaded and uploaded successfully',
                'uuid': video_id,
                's3_key': s3_key,
                'file_size': file_size
            })
        }

    except subprocess.TimeoutExpired:
        # Update history with error
        history_table.update_item(
            Key={'id': video_id},
            UpdateExpression='SET stage = :stage',
            ExpressionAttributeValues={':stage': -1}
        )
        return {
            'statusCode': 408,
            'body': json.dumps({'error': 'Download timed out - video may be too large'})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        # Update history with error
        try:
            history_table.update_item(
                Key={'id': video_id},
                UpdateExpression='SET stage = :stage',
                ExpressionAttributeValues={':stage': -1}
            )
        except:
            pass
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
    finally:
        # Clean up any remaining files
        try:
            if os.path.exists(output_file):
                os.remove(output_file)
            if os.path.exists(download_path):
                os.rmdir(download_path)
        except:
            pass
