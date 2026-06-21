'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeroVideoProps {
  videoUrl: string;
  posterImage?: string;
  title?: string;
  description?: string;
  linkUrl?: string;
  linkText?: string;
  autoplay?: boolean;
}

export function HeroVideo({
  videoUrl,
  posterImage,
  title,
  description,
  linkUrl,
  linkText = 'Shop Now',
  autoplay = true,
}: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (videoRef.current && autoplay) {
      videoRef.current.play().catch(() => {
        setIsPlaying(false);
      });
    }
  }, [autoplay]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleLoadedData = () => {
    setIsLoaded(true);
  };

  return (
    <div className="relative w-full aspect-video lg:aspect-[21/9] overflow-hidden bg-muted rounded-lg">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        poster={posterImage}
        muted={isMuted}
        loop
        playsInline
        onLoadedData={handleLoadedData}
      >
        <source src={videoUrl} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <div className="animate-pulse text-muted-foreground">Loading video...</div>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />

      {(title || description) && (
        <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-12 text-white pointer-events-none">
          <div className="max-w-3xl">
            {title && (
              <h2 className="text-3xl lg:text-5xl font-bold mb-3 drop-shadow-lg">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-base lg:text-xl mb-6 drop-shadow-md opacity-90">
                {description}
              </p>
            )}
            {linkUrl && (
              <Button
                asChild
                size="lg"
                className="pointer-events-auto shadow-lg"
              >
                <a href={linkUrl}>{linkText}</a>
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="absolute bottom-4 right-4 flex gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={togglePlay}
          className="rounded-full shadow-lg backdrop-blur-sm bg-white/90 hover:bg-white"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={toggleMute}
          className="rounded-full shadow-lg backdrop-blur-sm bg-white/90 hover:bg-white"
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
