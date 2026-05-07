import React, { useState, useMemo } from 'react';
import { pokeRogueMap } from '../engine/pokeRogueMap';

interface PathResult {
  path: string[];
  probability: number;
}

export function BiomePathfinder() {
  const [modo, setModo] = useState<'multiplos' | 'unico'>('unico');
  const [origem, setOrigem] = useState<string>("Town");
  const [destino, setDestino] = useState<string>("Space");
  const [destinosInput, setDestinosInput] = useState<string>("");

  const biomasDisponiveis = Object.keys(pokeRogueMap).sort();

  const rotas = useMemo(() => {
    const alvos = modo === 'unico' 
      ? [destino.toLowerCase()]
      : destinosInput.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    
    if (!origem || alvos.length === 0) return [];

    const caminhosEncontrados: PathResult[] = [];
    const precisaLoop = alvos.includes(origem.toLowerCase());
    
    function explorar(biomaAtual: string, caminhoAtual: string[], probAcumulada: number) {
      if (alvos.includes(biomaAtual.toLowerCase())) {
        // Se precisa loop e o caminho tem só 1 elemento, ignora (não é loop)
        if (precisaLoop && caminhoAtual.length === 1) {
          // continua explorando
        } else {
          caminhosEncontrados.push({
            path: [...caminhoAtual],
            probability: probAcumulada
          });
          return;
        }
      }

      if (caminhoAtual.length > 6) return;

      const vizinhos = pokeRogueMap[biomaAtual] || {};
      
      for (const [proximoBioma, probabilidade] of Object.entries(vizinhos)) {
        if (!caminhoAtual.includes(proximoBioma)) {
          explorar(proximoBioma, [...caminhoAtual, proximoBioma], probAcumulada * probabilidade);
        }
      }
    }

    explorar(origem, [origem], 1.0);

    // Ordenar por maior probabilidade e, em caso de empate, menor caminho
    return caminhosEncontrados.sort((a, b) => {
      if (b.probability !== a.probability) return b.probability - a.probability;
      return a.path.length - b.path.length;
    });

  }, [origem, destino, destinosInput, modo]);

  return (
    <div style={{ padding: '20px', background: '#1e1e24', color: '#fff', borderRadius: '8px' }}>
      <h2>🗺️ PokéRogue Biome GPS</h2>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <button 
          onClick={() => setModo('unico')} 
          style={{ 
            padding: '8px 16px', 
            background: modo === 'unico' ? '#4dabf7' : '#333', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: 'pointer' 
          }}
        >
          Bioma A → B
        </button>
        <button 
          onClick={() => setModo('multiplos')} 
          style={{ 
            padding: '8px 16px', 
            background: modo === 'multiplos' ? '#4dabf7' : '#333', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: 'pointer' 
          }}
        >
          Múltiplos Destinos
        </button>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>Bioma Atual:</label>
          <select 
            value={origem} 
            onChange={(e) => setOrigem(e.target.value)}
            style={{ padding: '8px', borderRadius: '4px', background: '#333', color: '#fff', border: 'none' }}
          >
            {biomasDisponiveis.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {modo === 'unico' ? (
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Destino:</label>
            <select 
              value={destino} 
              onChange={(e) => setDestino(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', background: '#333', color: '#fff', border: 'none' }}
            >
              {biomasDisponiveis.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Destinos (separados por vírgula):</label>
            <input 
              type="text" 
              placeholder="Ex: Space, Wasteland, Ice Cave" 
              value={destinosInput}
              onChange={(e) => setDestinosInput(e.target.value)}
              style={{ padding: '8px', width: '100%', borderRadius: '4px', background: '#333', color: '#fff', border: 'none' }}
            />
          </div>
        )}
      </div>

      <div style={{ marginTop: '20px' }}>
        <h3>Rotas Recomendadas</h3>
        {rotas.length === 0 && (modo === 'unico' || destinosInput.length > 0) && (
          <p style={{ color: '#ff6b6b' }}>Nenhum caminho encontrado com menos de 6 saltos.</p>
        )}
        
        {rotas.slice(0, 5).map((rota, index) => (
          <div key={index} style={{ background: '#2b2b36', padding: '15px', margin: '10px 0', borderRadius: '6px' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4dabf7' }}>
              Chance: {(rota.probability * 100).toFixed(1)}% | Saltos: {rota.path.length - 1}
            </div>
            <div style={{ marginTop: '10px', fontSize: '15px', color: '#adb5bd' }}>
              {rota.path.map((passo, i) => (
                <span key={i}>
                  <strong style={{ color: '#fff' }}>{passo}</strong>
                  {i < rota.path.length - 1 && <span style={{ margin: '0 8px', color: '#ffd43b' }}>→</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}