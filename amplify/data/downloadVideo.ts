import type { Schema } from "./resource";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient();

export const handler: Schema["downloadVideo"]["functionHandler"] = async (
  event
) => {
  const {
    videoUrl,
    videoName,
    modelID,
    historyId,
    numberOfVideos = 1,
    theme = "general",
    videoLength = 60
  } = event.arguments;

  const uuid = historyId;
  const downloadLambdaArn = process.env.DOWNLOAD_LAMBDA_ARN;
  const historyTableName = process.env.HISTORY_TABLE_NAME;
  const bucketName = process.env.BUCKET_NAME;

  try {
    // Invoke download Lambda asynchronously - history record already created by frontend
    const command = new InvokeCommand({
      FunctionName: downloadLambdaArn,
      InvocationType: 'Event',  // Async invocation
      Payload: JSON.stringify({
        videoUrl,
        uuid,
        videoName,
        modelID,
        numberOfVideos,
        theme,
        videoLength,
        historyTableName,
        bucketName
      })
    });

    await lambdaClient.send(command);

    return JSON.stringify({
      statusCode: 200,
      body: {
        uuid: uuid,
        message: 'Download started'
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return JSON.stringify({
      statusCode: 500,
      body: { error: String(error) }
    });
  }
};
