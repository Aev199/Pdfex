import { registeredHeaderActions } from './registry'

export function FeatureHeaderActions(): React.JSX.Element | null {
  const actions = registeredHeaderActions()
  if (actions.length === 0) return null
  return (
    <>
      {actions.map((action) => (
        <button
          key={action.id}
          className={`btn glass${action.icon ? ' square' : ''}`}
          title={action.title ?? action.label}
          onClick={action.onTrigger}
        >
          {action.icon ?? action.label}
        </button>
      ))}
    </>
  )
}
