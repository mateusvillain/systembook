// Fixture intencionalmente malformada: falta o campo `variants` do PreviewConfig.
export function Preview() {
  return <span>Broken</span>;
}

export default {
  component: 'Broken',
  controls: [],
};
