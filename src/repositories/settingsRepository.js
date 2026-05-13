export const settingsRepository = {
  getSections() {
    return [
      { id: 'aparencia', label: 'Aparência e Acessibilidade', description: 'Tema, cores e exibição', icon: 'palette' },
      { id: 'privacidade', label: 'Privacidade & LGPD', description: 'Dados e conformidade', icon: 'shield' },
      { id: 'dados', label: 'Dados & Backup', description: 'Exportação e backup', icon: 'database' },
    ]
  },
}
