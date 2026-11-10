/** Ein-/Aus-Schalter. Technisch eine Checkbox, damit Formulare ohne JavaScript funktionieren. */
export function Switch({
  name,
  defaultChecked,
  label,
  description,
}: {
  name: string;
  defaultChecked?: boolean;
  label: string;
  description?: string;
}) {
  return (
    <label className="switch-row">
      <span className="switch-text">
        <span className="switch-label">{label}</span>
        {description && <span className="switch-desc">{description}</span>}
      </span>
      <span className="switch">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} />
        <span className="switch-track" aria-hidden="true" />
      </span>
    </label>
  );
}
