import { icons } from '../icons';
import { Button } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { ToggleGroupControl, ToggleGroupControlOption } from './style-compat';
import LengthControl from './length-control';
import type { StyleTokens } from '../styles/tokens';
import { isBorderCollapse } from '../styles/border-layout';
import type { BorderCollapse } from '../styles/border-layout';

export default function TableBorderLayoutControl({
	value,
	tokens = {},
	onChange,
}: {
	value?: BorderCollapse;
	tokens?: StyleTokens;
	onChange: (attributes: {
		borderCollapse?: BorderCollapse;
		styleTokens?: StyleTokens;
	}) => void;
}) {
	const [linked, setLinked] = useState(
		tokens.borderSpacingHorizontal === tokens.borderSpacingVertical
	);
	const changeSpacing = (
		field: 'borderSpacingHorizontal' | 'borderSpacingVertical',
		next: string
	) => {
		const updated = { ...tokens };
		const fields = linked
			? (['borderSpacingHorizontal', 'borderSpacingVertical'] as const)
			: [field];
		for (const key of fields) {
			if (next) {
				updated[key] = next;
			} else {
				delete updated[key];
			}
		}
		onChange({ styleTokens: updated });
	};
	return (
		<>
			<ToggleGroupControl
				label={__('Border layout', 'modular-table-blocks')}
				value={value ?? 'collapse'}
				isBlock
				onChange={(next) => {
					if (isBorderCollapse(next)) {
						onChange({
							borderCollapse: next,
						});
					}
				}}
			>
				<ToggleGroupControlOption
					value="collapse"
					label={__('Collapse borders', 'modular-table-blocks')}
				/>
				<ToggleGroupControlOption
					value="separate"
					label={__('Separate borders', 'modular-table-blocks')}
				/>
			</ToggleGroupControl>
			{value === 'separate' && (
				<div className="modular-table-blocks-spacing-controls">
					<div className="modular-table-blocks-spacing-header">
						<span>{__('Spacing', 'modular-table-blocks')}</span>
						<Button
							icon={
								linked ? icons.axesLinked : icons.axesUnlinked
							}
							label={
								linked
									? __('Unlink axes', 'modular-table-blocks')
									: __('Link axes', 'modular-table-blocks')
							}
							isPressed={linked}
							onClick={() => setLinked(!linked)}
						/>
					</div>
					{linked ? (
						<LengthControl
							range
							label={__(
								'Horizontal and vertical spacing',
								'modular-table-blocks'
							)}
							kind="borderSpacingHorizontal"
							value={
								tokens.borderSpacingHorizontal ===
								tokens.borderSpacingVertical
									? (tokens.borderSpacingHorizontal ?? '')
									: ''
							}
							placeholder={
								tokens.borderSpacingHorizontal ===
								tokens.borderSpacingVertical
									? '0'
									: __(
											'Multiple values',
											'modular-table-blocks'
										)
							}
							onChange={(next) =>
								changeSpacing('borderSpacingHorizontal', next)
							}
						/>
					) : (
						(
							[
								'borderSpacingHorizontal',
								'borderSpacingVertical',
							] as const
						).map((field) => (
							<LengthControl
								key={field}
								range
								label={
									field === 'borderSpacingHorizontal'
										? __(
												'Horizontal spacing',
												'modular-table-blocks'
											)
										: __(
												'Vertical spacing',
												'modular-table-blocks'
											)
								}
								kind={field}
								value={tokens[field] ?? ''}
								placeholder="0"
								onChange={(next) => changeSpacing(field, next)}
							/>
						))
					)}
				</div>
			)}
		</>
	);
}
