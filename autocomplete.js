// Local snapshot of PokeAPI species names: suggestions never send typed prefixes online.
globalThis.PokemonNames = (() => {
    const names = new Map();
    function display(name) {
        if (name === 'nidoran-f') return 'Nidoran♀';
        if (name === 'nidoran-m') return 'Nidoran♂';
        return name.charAt(0).toUpperCase() + name.slice(1);
    }
    const ready = fetch('pokemon-names.json').then(response => {
        if (!response.ok) throw new Error('Catálogo de nombres no disponible.');
        return response.json();
    }).then(rows => {
        const list = document.createElement('datalist'); list.id = 'pokemon-name-suggestions';
        for (const row of rows) {
            const entry = { id: row.id, name: row.name, display: display(row.name) };
            names.set(row.name.toLowerCase(), entry); names.set(entry.display.toLowerCase(), entry); names.set(String(row.id), entry);
            const option = document.createElement('option'); option.value = entry.display;
            option.label = `#${String(row.id).padStart(4, '0')}`; list.append(option);
        }
        document.body.append(list);
        for (const id of ['pokeName', 'evo_search']) {
            const input = document.getElementById(id);
            input.setAttribute('list', list.id); input.setAttribute('autocomplete', 'off');
        }
    }).catch(() => { /* Free-text entry and existing lookups still work if the catalog fails. */ });
    return { ready, lookup: value => names.get(String(value).trim().toLowerCase()) };
})();
