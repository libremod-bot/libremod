import { Icon, type IconName } from "./Icon";

export function PageHeader({ icon, title, description }: { icon: IconName; title: string; description: string }) {
  return (
    <header className="page-header">
      <div className="page-icon">
        <Icon name={icon} size={22} />
      </div>
      <div>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
    </header>
  );
}
