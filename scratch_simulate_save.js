const db = {
  getLeaves: () => JSON.parse(JSON.stringify(cachedLeaves || [])),
  saveLeaves: (leaves) => {
    const oldLeaves = [...cachedLeaves];
    cachedLeaves = [...leaves];
    
    const oldLeavesMap = new Map(oldLeaves.map(l => [l.id, l]));
    const newLeavesMap = new Map(leaves.map(l => [l.id, l]));
    
    for (const [id, newL] of newLeavesMap.entries()) {
      const oldL = oldLeavesMap.get(id);
      if (JSON.stringify(oldL) !== JSON.stringify(newL)) {
        console.log("PUT request triggered for", id);
      } else {
        console.log("No change detected for", id);
      }
    }
  }
};

let cachedLeaves = [{ id: "lv-1", status: "Pending" }];

const leaves = db.getLeaves();
leaves[0].status = "Approved";
db.saveLeaves(leaves);
