import { MOVIE_PAIRS, TASTE_PAIRS, type Pair } from "./pairs";

export type Side = "a" | "b";
interface Props { picks: Record<string, Side>; onPick: (key: string, side: Side) => void }

export default function ThisOrThat({ picks, onPick }: Props) {
  const row = (pair: Pair) => {
    const cell = (side: Side) => {
      const me = pair[side];
      const other = pair[side === "a" ? "b" : "a"];
      return (
        <td>
          <label>
            <input
              type="checkbox"
              checked={picks[pair.key] === side}
              onChange={() => onPick(pair.key, side)}
              aria-label={`${me.label}, instead of ${other.label}`}
            />
            <span>{me.label}</span>
          </label>
        </td>
      );
    };
    return (
      <tr key={pair.key}>
        {cell("a")}
        <td className="or" aria-hidden="true">or</td>
        {cell("b")}
      </tr>
    );
  };

  const group = (title: string, pairs: Pair[]) => (
    <tbody key={title}>
      <tr><th colSpan={3} scope="colgroup" className="vs-group">{title}</th></tr>
      {pairs.map(row)}
    </tbody>
  );

  return (
    <table className="vs">
      <thead>
        <tr>
          <th scope="col">This</th>
          <th scope="col"><span className="sr">or</span></th>
          <th scope="col">That</th>
        </tr>
      </thead>
      {group("Movies", MOVIE_PAIRS)}
      {group("Taste", TASTE_PAIRS)}
    </table>
  );
}
