import { AlignmentControl } from '@wordpress/block-editor';
import { ToggleControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { captionIsEnabled } from '../caption';
import type { CaptionAttributes } from '../caption';
import { isHorizontalAlignment } from '../styles/horizontal-alignment';
import { ToggleGroupControl, ToggleGroupControlOption } from './style-compat';

export default function TableCaptionControl({
	attributes,
	onChange,
}: {
	attributes: CaptionAttributes;
	onChange: (attributes: Partial<CaptionAttributes>) => void;
}) {
	const enabled = captionIsEnabled(attributes);
	return (
		<div className="modular-table-blocks-control-stack">
			<ToggleControl
				label={__('Display caption', 'modular-table-blocks')}
				checked={enabled}
				onChange={(captionEnabled) => onChange({ captionEnabled })}
			/>
			{enabled && (
				<>
					<ToggleGroupControl
						label={__('Caption position', 'modular-table-blocks')}
						value={attributes.captionSide ?? 'top'}
						isBlock
						onChange={(value) => {
							if (value === 'top' || value === 'bottom') {
								onChange({ captionSide: value });
							}
						}}
					>
						<ToggleGroupControlOption
							value="top"
							label={__('Above table', 'modular-table-blocks')}
						/>
						<ToggleGroupControlOption
							value="bottom"
							label={__('Below table', 'modular-table-blocks')}
						/>
					</ToggleGroupControl>
					<div className="modular-table-blocks-caption-alignment">
						<span>
							{__('Caption alignment', 'modular-table-blocks')}
						</span>
						<AlignmentControl
							label={__(
								'Caption alignment',
								'modular-table-blocks'
							)}
							value={attributes.captionAlign}
							onChange={(value) =>
								onChange({
									captionAlign: isHorizontalAlignment(value)
										? value
										: undefined,
								})
							}
						/>
					</div>
				</>
			)}
		</div>
	);
}
