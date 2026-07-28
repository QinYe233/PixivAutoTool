export default function UserList({ users, onPick }) {
  return (
    <div className="user-list">
      <div className="section-title">找到 {users.length} 位作者，点击选择：</div>
      <div className="user-cards">
        {users.map((u) => (
          <button key={u.userId} className="user-card" onClick={() => onPick(u)}>
            {u.avatar ? (
              <img src={u.avatar} alt="" className="user-avatar" />
            ) : (
              <div className="user-avatar placeholder">{u.name?.[0] || '?'}</div>
            )}
            <div className="user-meta">
              <div className="user-name">{u.name}</div>
              <div className="user-id">ID: {u.userId}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
