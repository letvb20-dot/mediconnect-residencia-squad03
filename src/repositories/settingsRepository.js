export const settingsRepository = {
  getSections() {
    return [
      { id: 'aparencia', label: 'Aparência e Acessibilidade', description: 'Tema, cores e exibição', icon: 'palette' },
      { id: 'notificacoes', label: 'Notificações', description: 'Alertas e preferências', icon: 'bell' },
      { id: 'conta', label: 'Conta & Perfil', description: 'Dados da conta', icon: 'user' },
      { id: 'integracoes', label: 'Integrações', description: 'Serviços conectados', icon: 'plug' },
      { id: 'privacidade', label: 'Privacidade & LGPD', description: 'Dados e conformidade', icon: 'shield' },
      { id: 'dados', label: 'Dados & Backup', description: 'Exportação e backup', icon: 'database' },
    ]
  },
}
