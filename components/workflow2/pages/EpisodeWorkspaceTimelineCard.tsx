import React from 'react';
import { Card } from '../PagePrimitives';
import { EpisodeShotStrip } from '../EpisodeShotStrip';

interface EpisodeWorkspaceTimelineCardProps {
  shotStripProps: React.ComponentProps<typeof EpisodeShotStrip>;
}

export function EpisodeWorkspaceTimelineCard({ shotStripProps }: EpisodeWorkspaceTimelineCardProps) {
  return (
    <Card eyebrow="分镜条" title="分镜视频条">
      <EpisodeShotStrip {...shotStripProps} />
    </Card>
  );
}
