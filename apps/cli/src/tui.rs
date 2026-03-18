//! Lazygit-style TUI: persistent sidebar (left) + content area (right).
//! Used for main menu and all sub-screens; caller supplies sidebar and content strings.

use ratatui::{
    backend::CrosstermBackend,
    crossterm::{
        event::{self, Event, KeyCode, KeyEventKind, KeyModifiers},
        execute,
        terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
    },
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{
        Block, Borders, List, ListItem, ListState, Paragraph,
    },
    Frame, Terminal,
};
use std::io::{self, Stdout};

const SIDEBAR_WIDTH: u16 = 28;

/// Which panel has keyboard focus (Tab switches between them).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PanelFocus {
    Sidebar,
    Content,
}

/// Result of running the TUI. Indices refer to the current sidebar and content lists.
#[derive(Debug)]
pub enum TuiExit {
    /// User selected an item: (sidebar_index, content_index)
    Select(usize, usize),
    /// User pressed Space to toggle selection (e.g. grant/revoke permission bulk): (sidebar_index, content_index)
    ToggleSelect(usize, usize),
    /// User pressed Left (navigate back one view)
    Back,
    /// User pressed q (quit app; not emitted when in search input)
    Quit,
    /// User pressed Ctrl+F (open global search)
    OpenSearch,
    /// User submitted search (query string)
    SearchDone(String),
    /// User cancelled search (Esc in search bar)
    SearchCancel,
    /// User changed search query (live update)
    SearchChanged(String),
}

pub struct TuiState {
    pub sidebar_index: usize,
    pub content_index: usize,
    /// Which panel has focus; Tab switches between Sidebar and Content.
    pub focus: PanelFocus,
    list_state: ListState,
    content_state: ListState,
}

impl TuiState {
    pub fn new() -> Self {
        let mut list_state = ListState::default();
        list_state.select(Some(0));
        let mut content_state = ListState::default();
        content_state.select(Some(0));
        Self {
            sidebar_index: 0,
            content_index: 0,
            focus: PanelFocus::Sidebar,
            list_state,
            content_state,
        }
    }

    fn ensure_indices(&mut self, sidebar_len: usize, content_len: usize) {
        if sidebar_len == 0 {
            self.sidebar_index = 0;
            self.list_state.select(None);
        } else {
            self.sidebar_index = self.sidebar_index.min(sidebar_len.saturating_sub(1));
            self.list_state.select(Some(self.sidebar_index));
        }
        if content_len == 0 {
            self.content_index = 0;
            self.content_state.select(None);
        } else {
            self.content_index = self.content_index.min(content_len.saturating_sub(1));
            self.content_state.select(Some(self.content_index));
        }
    }
}

/// Optional callback: given current sidebar index, returns the content list for the right panel.
/// When set, the right panel is updated live when the user changes the sidebar selection (e.g. categories).
pub type ContentForSidebarFn = dyn FnMut(usize) -> Vec<String>;

/// Run the TUI with the given sidebar and content. Titles are used for the panel headers.
/// If `header` is `Some((lines, title))`, a box with that title and lines is drawn at the top.
/// If `search_bar` is `Some(query)`, the top area shows a search bar and key input is captured
/// until Enter (SearchDone) or Esc (SearchCancel). Search bar replaces the header when active.
/// If `content_for_sidebar` is `Some`, it is called each frame with the current sidebar index
/// to get the right-panel content, so the list updates live when the user changes the sidebar.
pub fn run_tui(
    state: &mut TuiState,
    title_left: &str,
    sidebar_items: &[String],
    title_right: &str,
    content_items: &[String],
    header: Option<(&[String], &str)>,
    search_bar: Option<&mut String>,
    content_for_sidebar: Option<&mut ContentForSidebarFn>,
) -> io::Result<TuiExit> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let result = run_tui_loop(
        &mut terminal,
        state,
        title_left,
        sidebar_items,
        title_right,
        content_items,
        header,
        search_bar,
        content_for_sidebar,
    );

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    result
}

fn run_tui_loop(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    state: &mut TuiState,
    title_left: &str,
    sidebar_items: &[String],
    title_right: &str,
    content_items: &[String],
    header: Option<(&[String], &str)>,
    mut search_bar: Option<&mut String>,
    mut content_for_sidebar: Option<&mut ContentForSidebarFn>,
) -> io::Result<TuiExit> {
    loop {
        let slen = sidebar_items.len();
        let current_content: Vec<String> = if let Some(ref mut f) = content_for_sidebar {
            f(state.sidebar_index)
        } else {
            content_items.to_vec()
        };
        let clen = current_content.len();
        state.ensure_indices(slen, clen);

        let in_search_mode = search_bar.is_some();
        let content_ref = current_content.as_slice();
        terminal.draw(|f| {
            ui(
                f,
                state,
                title_left,
                sidebar_items,
                title_right,
                content_ref,
                if in_search_mode { None } else { header },
                search_bar.as_ref().map(|s| (*s).as_str()),
            )
        })?;

        if event::poll(std::time::Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if key.kind != KeyEventKind::Press {
                    continue;
                }
                if in_search_mode {
                    if let Some(query) = search_bar.as_mut() {
                        match key.code {
                            KeyCode::Esc => return Ok(TuiExit::SearchCancel),
                            KeyCode::Enter => return Ok(TuiExit::SearchDone(query.clone())),
                            KeyCode::Backspace => {
                                query.pop();
                                return Ok(TuiExit::SearchChanged(query.clone()));
                            }
                            KeyCode::Char(c) => {
                                query.push(c);
                                return Ok(TuiExit::SearchChanged(query.clone()));
                            }
                            _ => {}
                        }
                    }
                    continue;
                }
                if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('f') {
                    return Ok(TuiExit::OpenSearch);
                }
                match key.code {
                    KeyCode::Tab => {
                        state.focus = match state.focus {
                            PanelFocus::Sidebar => PanelFocus::Content,
                            PanelFocus::Content => PanelFocus::Sidebar,
                        };
                    }
                    KeyCode::Char('q') => return Ok(TuiExit::Quit),
                    KeyCode::Left => return Ok(TuiExit::Back),
                    KeyCode::Right | KeyCode::Esc => {}
                    KeyCode::Up => {
                        match state.focus {
                            PanelFocus::Sidebar if slen > 0 && state.sidebar_index > 0 => {
                                state.sidebar_index = state.sidebar_index.saturating_sub(1);
                                state.content_index = 0;
                            }
                            PanelFocus::Content if clen > 0 => {
                                state.content_index = state.content_index.saturating_sub(1);
                            }
                            _ => {}
                        }
                    }
                    KeyCode::Down => {
                        match state.focus {
                            PanelFocus::Sidebar if state.sidebar_index < slen.saturating_sub(1) => {
                                state.sidebar_index = (state.sidebar_index + 1).min(slen.saturating_sub(1));
                                state.content_index = 0;
                            }
                            PanelFocus::Content if clen > 0 => {
                                state.content_index = (state.content_index + 1).min(clen - 1);
                            }
                            _ => {}
                        }
                    }
                    KeyCode::Char(' ') => {
                        if state.focus == PanelFocus::Content && clen > 0 {
                            return Ok(TuiExit::ToggleSelect(
                                state.sidebar_index,
                                state.content_index,
                            ));
                        }
                    }
                    KeyCode::Enter => {
                        if clen > 0 {
                            return Ok(TuiExit::Select(state.sidebar_index, state.content_index));
                        }
                        if slen > 0 {
                            return Ok(TuiExit::Select(state.sidebar_index, 0));
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

const SEARCH_BAR_HEIGHT: u16 = 5;

fn ui(
    f: &mut Frame,
    state: &mut TuiState,
    title_left: &str,
    sidebar_items: &[String],
    title_right: &str,
    content_items: &[String],
    header: Option<(&[String], &str)>,
    search_bar_query: Option<&str>,
) {
    let area = f.area();
    let main_area = if let Some(query) = search_bar_query {
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(SEARCH_BAR_HEIGHT), Constraint::Min(10)])
            .split(area);
        let search_block = Block::default()
            .title("  Search  ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Yellow));
        let search_text = format!("Search: {}", query);
        let search_paragraph = Paragraph::new(search_text.as_str())
            .style(Style::default().fg(Color::Yellow))
            .block(search_block);
        f.render_widget(search_paragraph, chunks[0]);
        let inner_x = chunks[0].x + 1;
        let inner_w = chunks[0].width.saturating_sub(2);
        let cursor_x = (inner_x + 8 + query.len() as u16).min(inner_x + inner_w.saturating_sub(1));
        let cursor_y = chunks[0].y + 1;
        f.set_cursor_position((cursor_x, cursor_y));
        chunks[1]
    } else if let Some((lines, title)) = header {
        let content_h = lines.len() as u16;
        let block_h = content_h + 3;
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(block_h), Constraint::Min(10)])
            .split(area);
        let header_block = Block::default()
            .title(format!("  {}  ", title))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Cyan));
        let header_paragraph = Paragraph::new(
            lines
                .iter()
                .map(|s| Line::from(s.as_str()))
                .collect::<Vec<_>>(),
        )
        .style(Style::default().fg(Color::Cyan))
        .block(header_block);
        f.render_widget(header_paragraph, chunks[0]);
        chunks[1]
    } else {
        area
    };

    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Length(SIDEBAR_WIDTH), Constraint::Min(24)])
        .split(main_area);

    let sidebar_focused = state.focus == PanelFocus::Sidebar;
    let sidebar_list: Vec<ListItem> = sidebar_items
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let style = if i == state.sidebar_index {
                Style::default().fg(Color::Black).bg(Color::Cyan).add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            ListItem::new(Line::from(Span::styled(s.as_str(), style)))
        })
        .collect();
    state.list_state.select(Some(state.sidebar_index));
    let sidebar_border = if sidebar_focused {
        Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(Color::Cyan)
    };
    let sidebar = List::new(sidebar_list)
        .block(
            Block::default()
                .title(format!("  {}  ", title_left))
                .borders(Borders::ALL)
                .border_style(sidebar_border),
        )
        .highlight_style(Style::default().fg(Color::Black).bg(Color::Cyan).add_modifier(Modifier::BOLD))
        .highlight_symbol("▸ ");
    f.render_stateful_widget(sidebar, chunks[0], &mut state.list_state);

    let content_focused = state.focus == PanelFocus::Content;
    let content_list: Vec<ListItem> = content_items
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let style = if i == state.content_index {
                Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            ListItem::new(Line::from(Span::styled(s.as_str(), style)))
        })
        .collect();
    state.content_state.select(if content_items.is_empty() {
        None
    } else {
        Some(state.content_index.min(content_items.len().saturating_sub(1)))
    });
    let content_border = if content_focused {
        Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(Color::DarkGray)
    };
    let content = List::new(content_list)
        .block(
            Block::default()
                .title(format!("  {}  ", title_right))
                .borders(Borders::ALL)
                .border_style(content_border),
        )
        .highlight_style(Style::default().fg(Color::Black).bg(Color::Yellow).add_modifier(Modifier::BOLD))
        .highlight_symbol("  › ");
    f.render_stateful_widget(content, chunks[1], &mut state.content_state);

    let help = Paragraph::new(Line::from(vec![
        Span::styled(" Tab ", Style::default().fg(Color::DarkGray)),
        Span::raw("switch panel  "),
        Span::styled(" ↑↓ ", Style::default().fg(Color::DarkGray)),
        Span::raw("navigate  "),
        Span::styled(" Space ", Style::default().fg(Color::DarkGray)),
        Span::raw("toggle select  "),
        Span::styled(" Enter ", Style::default().fg(Color::DarkGray)),
        Span::raw("select  "),
        Span::styled(" ← ", Style::default().fg(Color::DarkGray)),
        Span::raw("back  "),
        Span::styled(" Ctrl+F ", Style::default().fg(Color::DarkGray)),
        Span::raw("search  "),
        Span::styled(" q ", Style::default().fg(Color::DarkGray)),
        Span::raw("quit"),
    ]))
    .style(Style::default().fg(Color::DarkGray));
    let help_area = Rect {
        x: chunks[1].x,
        y: chunks[1].bottom().saturating_sub(1),
        width: chunks[1].width,
        height: 1,
    };
    f.render_widget(help, help_area);
}
