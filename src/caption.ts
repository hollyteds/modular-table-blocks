import type { HorizontalAlignment } from './styles/horizontal-alignment';

export type CaptionAttributes = {
	caption: string;
	captionEnabled?: boolean;
	captionSide?: 'top' | 'bottom';
	captionAlign?: HorizontalAlignment;
};

export function captionIsEnabled(attributes: CaptionAttributes): boolean {
	return attributes.captionEnabled ?? Boolean(attributes.caption);
}
