import { Fragment, useState } from '@wordpress/element';
import type { ReactNode } from 'react';
import { ToolsPanel, ToolsPanelItem } from './style-compat';

export default function TableSettingsSection({
	id,
	label,
	hasValue,
	onReset,
	children,
}: {
	id: string;
	label: string;
	hasValue: boolean;
	onReset: () => void;
	children: ReactNode;
}) {
	const [resetVersion, setResetVersion] = useState(0);
	const reset = () => {
		onReset();
		// Clear local unit/link choices along with the stored settings.
		setResetVersion((version) => version + 1);
	};
	return (
		<div
			className="modular-table-blocks-table-settings__section"
			role="group"
			aria-label={label}
		>
			<ToolsPanel
				className="modular-table-blocks-settings-tools"
				label={label}
				panelId={id}
				headingLevel={3}
				resetAll={reset}
			>
				<ToolsPanelItem
					className="modular-table-blocks-settings-tools-content"
					label={label}
					panelId={id}
					isShownByDefault
					hasValue={() => hasValue}
					onDeselect={reset}
				>
					<Fragment key={resetVersion}>{children}</Fragment>
				</ToolsPanelItem>
			</ToolsPanel>
		</div>
	);
}
