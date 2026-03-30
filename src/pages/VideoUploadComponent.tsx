// VideoUploadComponent.tsx

import React, { useEffect, useState } from 'react';
import { Container, Header, Tiles, Select, Alert, FormField, Input, Button, SpaceBetween } from '@cloudscape-design/components';
import { StorageManager } from '@aws-amplify/ui-react-storage';
import { useNavigate } from 'react-router-dom';
import { createHistory, downloadVideoFromUrl } from '../apis/history';
import { modelOptions } from '../data/modelList';

const VideoUploadComponent: React.FC = () => {

  const options = modelOptions.map(model => ({
    label: model.name,
    value: model.modelId,
  }))

  const [tileValue, setTileValue] = useState("upload");
  const [uuid, setUuid] = useState("");
  const [selectedModel, setSelectedModel] = useState({
    label: "Claude Opus 4.6 (Recommended)",
    value: "us.anthropic.claude-opus-4-6-v1:0",
  });
  const [numberOfVideos, setNumberOfVideos] = useState("1");
  const [theme, setTheme] = useState("");
  const [videoLength, setVideoLength] = useState("60");
  const [videoUrl, setVideoUrl] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const navigate = useNavigate();

  const handleUrlDownload = async () => {
    if (!videoUrl) return;

    setIsDownloading(true);
    try {
      const videoName = videoUrl.split('/').pop() || 'downloaded-video';

      // Create history record first so it exists before navigating
      const history = await createHistory(
        videoName,
        selectedModel.value,
        parseInt(numberOfVideos),
        theme || "general",
        parseInt(videoLength),
        "url"
      );

      if (!history) {
        throw new Error('Failed to create history record');
      }

      // Start async download - Lambda will upload to S3 using the history ID
      await downloadVideoFromUrl(
        videoUrl,
        videoName,
        selectedModel.value,
        history.id,
        parseInt(numberOfVideos),
        theme || "general",
        parseInt(videoLength)
      );

      navigate(`/history/${history.id}`);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to start download. Please check the URL and try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
  }, [uuid])


  const processFile = async ({file, key}: {file:File, key:string}) => {
    
    const history = await createHistory(
      key, 
      selectedModel.value,
      parseInt(numberOfVideos),
      theme || "general",
      parseInt(videoLength)
    );
  
    return { file, key: `${history!.id}/RAW.mp4`, useAccelerateEndpoint:true};
  };

  const processFileForSubtitle = async ({file, key}: {file:File, key:string}) => {
    
    const history = await createHistory(
      key, 
      selectedModel.value,
      parseInt(numberOfVideos),
      theme || "general",
      parseInt(videoLength)
    );
  
    return { file, key: `${history?.id}/Transcript.json`, useAccelerateEndpoint:true};
  };

  const processFileForVideo = async ({file}: {file:File, key:string}) => {
      
    return { file, key: `${uuid}/RAW.mp4`, useAccelerateEndpoint:true};
  };

  return (
    <Container
      header={
        <Header variant="h2">
          Upload Video
        </Header>
      }
    >
      <Tiles
        onChange={({ detail }) => setTileValue(detail.value)}
        value={tileValue}
        items={[
          { label: "Direct Upload", value: "upload" },
          { label: "Upload with Subtitle", value: "subtitle" },
          { label: "Download from URL", value: "url" },
        ]}
      />
      <h3>Select LLM</h3>
      <Select
        selectedOption={selectedModel}
        onChange={({ detail }) => 
          setSelectedModel(detail.selectedOption as { label: string; value: string })
        }
        options={options}
        placeholder="Select the LLM model"
      />
      <br />
      <FormField label="Number of Videos">
        <Input
          type="number"
          value={numberOfVideos}
          onChange={({ detail }) => setNumberOfVideos(detail.value)}
          placeholder="Enter number of videos to create"
        />
      </FormField>
      <FormField label="Theme Focus">
        <Input
          value={theme}
          onChange={({ detail }) => setTheme(detail.value)}
          placeholder="Enter theme to focus on (e.g., technical, entertainment)"
        />
      </FormField>
      <FormField label="Video Length (seconds)">
        <Input
          type="number"
          value={videoLength}
          onChange={({ detail }) => setVideoLength(detail.value)}
          placeholder="Enter length for each video in seconds"
        />
      </FormField>
      <br />
      {tileValue === "upload" && (
        <StorageManager
          acceptedFileTypes={['video/*']}
          path={`videos/`}
          maxFileCount={1}
          isResumable
          autoUpload={false}
          processFile={processFile}
          onUploadSuccess={({key})=> {
            const uuid = key!.split('/')[1];
            navigate(`/history/${uuid}`)
          }}
        />
      )}
      {tileValue === "subtitle" && (
        <>
        <h3>Upload Subtitle</h3>
        <StorageManager
          acceptedFileTypes={['.json']}
          path={`videos/`}
          maxFileCount={1}
          isResumable
          autoUpload={false}
          processFile={processFileForSubtitle}
          onUploadSuccess={({key})=> {
            const uuid = key!.split('/')[1];
            setUuid(uuid)
          }}
        />
        <h3>Upload Video</h3>
        {uuid === "" ?     
        <Alert
          statusIconAriaLabel="Info"
        >
          You can upload video after uploading subtitle.
        </Alert> :
        <StorageManager
          acceptedFileTypes={['video/*']}
          path={`videos/`}
          maxFileCount={1}
          isResumable
          autoUpload={false}
          processFile={processFileForVideo}
          onUploadSuccess={({key})=> {
            const uuid = key!.split('/')[1];
            navigate(`/history/${uuid}`)
          }}
        />}
        </>
      )}
      {tileValue === "url" && (
        <SpaceBetween size="m">
          <h3>Video URL</h3>
          <Alert statusIconAriaLabel="Info" type="info">
            Supports YouTube, Vimeo, and most video platforms. Max file size: 2GB.
          </Alert>
          <FormField
            label="Enter video URL"
            description="Paste the URL of the video you want to process"
          >
            <Input
              value={videoUrl}
              onChange={({ detail }) => setVideoUrl(detail.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              disabled={isDownloading}
            />
          </FormField>
          <Button
            variant="primary"
            loading={isDownloading}
            onClick={handleUrlDownload}
            disabled={!videoUrl || isDownloading}
          >
            {isDownloading ? 'Downloading...' : 'Download and Process'}
          </Button>
        </SpaceBetween>
      )}
    </Container>
  );
};

export default VideoUploadComponent;