import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Duration, Size } from 'aws-cdk-lib/core';

type DownloadVideoUrlProps = {
  bucket: IBucket;
  historyTable: ITable;
};

export class DownloadVideoUrl extends Construct {
  public readonly handler: lambda.Function;

  constructor(scope: Construct, id: string, props: DownloadVideoUrlProps) {
    super(scope, id);

    // yt-dlp Lambda Layer
    const ytdlpLayer = new lambda.LayerVersion(this, 'YtDlpLayer', {
      code: lambda.Code.fromAsset('amplify/custom/lambda-layers/yt-dlp'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: 'yt-dlp binary for video downloading',
    });

    // Create Lambda function
    this.handler = new lambda.Function(this, 'DownloadVideoUrlFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset('amplify/custom/lambda-functions/download-video-url'),
      timeout: Duration.minutes(15),  // Max Lambda timeout
      memorySize: 3008,               // More memory for video download/upload
      ephemeralStorageSize: Size.gibibytes(10),  // Max ephemeral storage for large videos
      layers: [ytdlpLayer],
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        HISTORY_TABLE_NAME: props.historyTable.tableName
      }
    });

    // Grant S3 permissions
    props.bucket.grantReadWrite(this.handler);

    // Grant DynamoDB permissions
    props.historyTable.grantReadWriteData(this.handler);
  }
}
