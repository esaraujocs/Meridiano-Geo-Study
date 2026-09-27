import { t } from "../domain/i18n";

// A moldura do nível (`.hub-level`, index.css) ficava simples demais — só um círculo com o número (28/09, o Enzo pediu mais riqueza aqui e em
// todo lugar que representa o PERFIL do jogador, não só no Hub). `LevelTicks` soma 4 tiques de brass nos pontos cardeais por cima do anel/borda
// que já existia; `LevelBadge` reaproveita a mesma classe `.hub-level` (e os tiques) fora do Hub, onde não há XP para desenhar o arco de progresso
// — hoje só o lobby do duelo com amigo (o "Você" ali era um círculo genérico com um ícone, sem nada do perfil de quem está jogando).
export function LevelTicks() {
  return (
    <svg className="hub-level-ticks" viewBox="0 0 132 132" aria-hidden="true">
      <line x1="66" y1="3" x2="66" y2="17" />
      <line x1="66" y1="115" x2="66" y2="129" />
      <line x1="3" y1="66" x2="17" y2="66" />
      <line x1="115" y1="66" x2="129" y2="66" />
    </svg>
  );
}

export function LevelBadge({ level }: { level: number }) {
  return (
    <div className="hub-level" role="img" aria-label={t.hub.levelBadge(level)}>
      <LevelTicks />
      <strong>{level}</strong>
    </div>
  );
}
