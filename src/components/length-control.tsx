import { useEffect, useState } from '@wordpress/element';
import { lengthBounds, lengthValue } from '../styles/controls';
import type { LengthKind, Unit } from '../styles/controls';
import { isValidToken } from '../styles/tokens';
import { UnitControl } from './style-compat';

export default function LengthControl({
	label,
	kind,
	value,
	onChange,
	placeholder,
}: {
	label: string;
	kind: LengthKind;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}) {
	const parsed = lengthValue(value);
	const [unit, setUnit] = useState<Unit>(
		parsed?.unit ?? (kind === 'tableWidth' ? '%' : 'px')
	);
	const parsedUnit = parsed?.unit;
	useEffect(() => {
		if (parsedUnit) {
			setUnit(parsedUnit);
		}
	}, [parsedUnit]);
	const bounds = lengthBounds(kind, unit);
	return (
		<UnitControl
			label={label}
			value={parsed ? value : ''}
			unit={unit}
			placeholder={placeholder}
			units={(kind === 'tableWidth' || kind === 'fontSize'
				? ['px', 'rem', 'em', '%']
				: ['px', 'rem', 'em']
			).map((item) => ({
				value: item,
				label: item,
				step: lengthBounds(kind, item as Unit).step,
			}))}
			{...bounds}
			onChange={(next) => {
				if (!next) {
					onChange('');
				} else if (isValidToken(kind, next)) {
					onChange(next);
				}
			}}
			onUnitChange={(next) => {
				if (!next) {
					return;
				}
				setUnit(next as Unit);
				if (parsed) {
					const limits = lengthBounds(kind, next as Unit);
					const amount = Math.min(
						limits.max,
						Math.max(limits.min, parsed.amount)
					);
					onChange(`${amount}${next}`);
				}
			}}
		/>
	);
}
