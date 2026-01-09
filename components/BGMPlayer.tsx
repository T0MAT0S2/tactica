import React, { useEffect, useRef, useState, useCallback } from 'react';

interface BGMPlayerProps {
  playlistString: string;
  isPlaying: boolean;
}

const BGMPlayer: React.FC<BGMPlayerProps> = ({ playlistString, isPlaying }) => {
  const playerRef = useRef<any>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [volume, setVolume] = useState(50);
  const [currentTitle, setCurrentTitle] = useState("BGM 로딩 중...");
  const [playlist, setPlaylist] = useState<string[]>([]);
  const [showControls, setShowControls] = useState(false);

  const parseVideoIds = (str: string) => {
    if (!str) return [];
    return str.split(',').map(item => {
        const i = item.trim();
        const match = i.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
        if (match && match[2].length === 11) return match[2];
        if (i.length === 11) return i;
        return null;
    }).filter(id => id) as string[];
  };

  useEffect(() => {
    setPlaylist(parseVideoIds(playlistString));
  }, [playlistString]);

  useEffect(() => {
    // Load YouTube IFrame API
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    (window as any).onYouTubeIframeAPIReady = () => {
      createPlayer();
    };

    if ((window as any).YT && (window as any).YT.Player) {
      createPlayer();
    }
  }, []);

  const createPlayer = () => {
    if (playerRef.current) return;
    
    playerRef.current = new (window as any).YT.Player('youtube-player-div', {
      height: '0',
      width: '0',
      playerVars: {
        'playsinline': 1,
        'autoplay': 1,
        'loop': 0
      },
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange
      }
    });
  };

  const onPlayerReady = (event: any) => {
    setPlayerReady(true);
    event.target.setVolume(volume);
  };

  const onPlayerStateChange = (event: any) => {
      const YT = (window as any).YT;
      if (event.data === YT.PlayerState.PLAYING) {
        if(playerRef.current && playerRef.current.getVideoData) {
             const data = playerRef.current.getVideoData();
             setCurrentTitle(data.title || "재생 중");
        }
      } else if (event.data === YT.PlayerState.ENDED) {
         // Auto next handled by playlist usually, but force next if needed
      }
  };

  // Sync playlist
  useEffect(() => {
    if (playerReady && playerRef.current && playlist.length > 0) {
       // Only load if different or empty
       // Since cuePlaylist is reliable, we use it
       playerRef.current.cuePlaylist(playlist);
       if (isPlaying) {
           setTimeout(() => playerRef.current.playVideoAt(0), 1000); // Small delay for stability
       }
    } else if (playerReady && playerRef.current && playlist.length === 0) {
        playerRef.current.stopVideo();
    }
  }, [playlist, playerReady]);

  // Sync playing state
  useEffect(() => {
    if (playerReady && playerRef.current) {
        if (isPlaying && playlist.length > 0) {
            setShowControls(true);
            if (playerRef.current.getPlayerState() !== 1) { // 1 is playing
                playerRef.current.playVideo();
            }
        } else {
            setShowControls(false);
            playerRef.current.stopVideo();
        }
    }
  }, [isPlaying, playerReady, playlist]);


  // Sync Volume
  useEffect(() => {
    if (playerReady && playerRef.current) {
        playerRef.current.setVolume(volume);
    }
  }, [volume, playerReady]);

  if (!showControls) return <div id="youtube-player-div" className="hidden" />;

  return (
    <div className="fixed bottom-2 left-2 z-50 bg-[#1e1b18] border border-[#4a3f35] p-2 rounded-lg bg-opacity-90 backdrop-blur-sm flex items-center gap-1 shadow-lg">
      <div id="youtube-player-div" className="hidden" />
      <button onClick={() => playerRef.current?.previousVideo()} className="w-8 h-8 rounded bg-[#3d352e] hover:bg-[#4a3f35] border border-[#5a4d41] text-[#f2e9e4] flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 3.5A.5.5 0 0 0 0 4v8a.5.5 0 0 0 1 0V4a.5.5 0 0 0-.5-.5Zm4.854 8.646a.5.5 0 0 0 .708 0l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L9.293 8l-3.647 3.646a.5.5 0 0 0 0 .708Zm5.708 0a.5.5 0 0 0 .708 0l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L15.293 8l-3.647 3.646a.5.5 0 0 0 0 .708Z"/></svg>
      </button>
      <button onClick={() => {
          if(playerRef.current?.getPlayerState() === 1) playerRef.current.pauseVideo();
          else playerRef.current.playVideo();
      }} className="w-8 h-8 rounded bg-[#3d352e] hover:bg-[#4a3f35] border border-[#5a4d41] text-[#f2e9e4] flex items-center justify-center">
         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5zm5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5z"/></svg>
      </button>
      <button onClick={() => playerRef.current?.nextVideo()} className="w-8 h-8 rounded bg-[#3d352e] hover:bg-[#4a3f35] border border-[#5a4d41] text-[#f2e9e4] flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M15.5 3.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5ZM11.146 8.646a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L10.293 8 6.646 4.354a.5.5 0 1 1 .708-.708l4 4ZM5.146 8.646a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L4.293 8 .646 4.354a.5.5 0 1 1 .708-.708l4 4Z"/></svg>
      </button>
      <div className="flex flex-col ml-1">
          <span className="text-xs text-[#a99985] truncate w-24 md:w-32">{currentTitle}</span>
          <input type="range" min="0" max="100" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-24 md:w-32 h-1 accent-[#c6a779] cursor-pointer" />
      </div>
    </div>
  );
};

export default BGMPlayer;
