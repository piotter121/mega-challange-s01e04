import type { ParsedNight } from '../digest/types.js';

function missing(value: string | null) {
  return value ?? <span class="mute">—</span>;
}

export function Digest({ night }: { night: ParsedNight }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
              <th>failure</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => {
              const retryWarning = row.retries >= 3;
              const failureWarning = row.hasFailure;

              return (
                <tr data-job={row.job}>
                  <td>{row.job}</td>
                  <td>{missing(row.owner)}</td>
                  <td>{row.runs}</td>
                  <td class={retryWarning ? 'warn' : undefined}>
                    {row.retries}
                    {retryWarning ? ' · retry threshold reached' : ''}
                  </td>
                  <td>{row.lastStatus}</td>
                  <td>{missing(row.lastError)}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                  <td class={failureWarning ? 'warn' : undefined}>
                    {failureWarning ? 'yes · failure recorded' : 'no'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {night.badLines > 0 ? (
        <p class="warn">bad lines: {night.badLines}</p>
      ) : null}
    </>
  );
}
