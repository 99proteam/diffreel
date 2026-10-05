function loadProfile(userId: string) {
  return fetch(`/api/users/${userId}`)
    .then((res) => {
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    })
    .then((user) => {
      return fetch(`/api/teams/${user.teamId}`)
        .then((res) => res.json())
        .then((team) => ({ user, team }));
    })
    .catch((err) => {
      console.error(err);
      return null;
    });
}
