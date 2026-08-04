I want a simple local web page with the following features:

- displays chess board
- start position from db `proof_tree_meta`
- shows start fen
- list moves all child moves of the current position from the db
  - on click move is applied, board and move list updated
- undo last move
- show current line of moves / move history

technical details:

- directory: `fe/`
- tech stack: npm, html, css, javascript
- Frontend-Server: `localhost:7000`
- connect to postgres db on localhost:5432
- moves are stored in uci format
