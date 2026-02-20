declare module 'opus-media-recorder' {
  interface OpusWorkerOptions {
    encoderWorkerFactory?: () => Worker;
    OggOpusEncoderWasmPath?: string;
    WebMOpusEncoderWasmPath?: string;
  }

  interface OpusMediaRecorderConstructor {
    new (
      stream: MediaStream,
      options?: MediaRecorderOptions,
      workerOptions?: OpusWorkerOptions
    ): MediaRecorder;
    isTypeSupported: (mimeType: string) => boolean;
  }

  const OpusMediaRecorder: OpusMediaRecorderConstructor;
  export default OpusMediaRecorder;
}
