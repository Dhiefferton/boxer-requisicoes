import { useCallback, useEffect, useState, type DependencyList } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Executa `fetcher` sempre que `deps` mudar e expõe { data, loading, error }.
 * Use `reload()` para refazer a busca manualmente (ex: depois de uma escrita).
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: DependencyList = []) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelado = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcher()
      .then((data) => {
        if (!cancelado) setState({ data, loading: false, error: null })
      })
      .catch((err) => {
        if (!cancelado) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Não foi possível carregar os dados.',
          })
        }
      })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { ...state, reload }
}
