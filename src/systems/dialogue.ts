/**
 * NPC Dialogue System
 * Delivers lore through cryptic, incomplete dialogue — never exposition dumps
 * Per design brief: "lore is delivered through absence and object, never through exposition"
 */

export interface DialogueLine {
  speaker: string;
  text: string;
  choices?: DialogueChoice[];
}

export interface DialogueChoice {
  text: string;
  nextNodeId: string;
  condition?: string;  // e.g., "has_item:ashgrave_longsword"
}

export interface DialogueNode {
  id: string;
  lines: DialogueLine[];
  nextNodeId?: string;  // auto-advance
  condition?: string;
  action?: string;      // e.g., "open_shop", "upgrade_weapon", "attune"
}

export interface DialogueTree {
  id: string;
  npcId: string;
  startNodeId: string;
  nodes: Map<string, DialogueNode>;
  onceOnly: Set<string>;  // nodes that play only once
}

// ─── NPC Dialogue Definitions ────────────────────────────────────

function createWakingChoirDialogue(): DialogueTree {
  const nodes = new Map<string, DialogueNode>();

  nodes.set('greeting', {
    id: 'greeting',
    lines: [
      { speaker: 'First Sister', text: 'You return...' },
      { speaker: 'Second Sister', text: '...as ash returns to ash.' },
      { speaker: 'Third Sister', text: 'Will you Attune?' },
    ],
    nextNodeId: 'attune_offer',
  });

  nodes.set('attune_offer', {
    id: 'attune_offer',
    lines: [
      { speaker: 'First Sister', text: 'The ember remembers shapes. Yours can grow...' },
      { speaker: 'Second Sister', text: '...or remain small. Some prefer smallness.' },
      { speaker: 'Third Sister', text: 'What shape will you take?' },
    ],
    action: 'open_attune',
    nextNodeId: 'farewell',
  });

  nodes.set('farewell', {
    id: 'farewell',
    lines: [
      { speaker: 'First Sister', text: 'The Vigil continues.' },
      { speaker: 'Second Sister', text: '...as it always does.' },
      { speaker: 'Third Sister', text: '...' },
    ],
  });

  nodes.set('post_ashgrave', {
    id: 'post_ashgrave',
    lines: [
      { speaker: 'First Sister', text: 'The Herald has fallen...' },
      { speaker: 'Second Sister', text: '...but the Hush does not mourn its heralds.' },
      { speaker: 'Third Sister', text: 'Deeper now. The marsh calls.' },
    ],
    nextNodeId: 'attune_offer',
  });

  return {
    id: 'waking_choir',
    npcId: 'waking_choir',
    startNodeId: 'greeting',
    nodes,
    onceOnly: new Set(),
  };
}

function createCoalspineDialogue(): DialogueTree {
  const nodes = new Map<string, DialogueNode>();

  nodes.set('greeting', {
    id: 'greeting',
    lines: [
      { speaker: 'Old Coalspine', text: 'Ah, another customer. Or corpse. Hard to tell these days.' },
      { speaker: 'Old Coalspine', text: 'I\'ve got what you need. Provided what you need is overpriced and slightly cursed.' },
    ],
    nextNodeId: 'shop',
  });

  nodes.set('shop', {
    id: 'shop',
    lines: [
      { speaker: 'Old Coalspine', text: 'Take a look. Don\'t touch the red ones. Actually, touch whatever you like — you\'re the one who has to live with the consequences.' },
    ],
    action: 'open_shop',
    nextNodeId: 'farewell',
  });

  nodes.set('farewell', {
    id: 'farewell',
    lines: [
      { speaker: 'Old Coalspine', text: 'Sold three today. Bought nothing. There is nothing left worth buying.' },
    ],
  });

  nodes.set('after_first_boss', {
    id: 'after_first_boss',
    lines: [
      { speaker: 'Old Coalspine', text: 'Still breathing? Either you\'re very good or very stubborn.' },
      { speaker: 'Old Coalspine', text: 'In my experience, those are the same thing.' },
    ],
    nextNodeId: 'shop',
  });

  return {
    id: 'coalspine',
    npcId: 'coalspine',
    startNodeId: 'greeting',
    nodes,
    onceOnly: new Set(),
  };
}

function createFerroDialogue(): DialogueTree {
  const nodes = new Map<string, DialogueNode>();

  nodes.set('greeting', {
    id: 'greeting',
    lines: [
      { speaker: 'Ferro the Hollow-Handed', text: '...' },
      { speaker: 'Ferro the Hollow-Handed', text: 'Show me what you carry.' },
    ],
    nextNodeId: 'forge',
  });

  nodes.set('forge', {
    id: 'forge',
    lines: [
      { speaker: 'Ferro the Hollow-Handed', text: 'Steel remembers what flesh forgets. I can make your weapon remember harder.' },
    ],
    action: 'open_cindersmithing',
    nextNodeId: 'farewell',
  });

  nodes.set('farewell', {
    id: 'farewell',
    lines: [
      { speaker: 'Ferro the Hollow-Handed', text: '...go. The forge will be here when you return.' },
    ],
  });

  return {
    id: 'ferro',
    npcId: 'ferro',
    startNodeId: 'greeting',
    nodes,
    onceOnly: new Set(),
  };
}

function createScribeDialogue(): DialogueTree {
  const nodes = new Map<string, DialogueNode>();

  nodes.set('ashen_coast', {
    id: 'ashen_coast',
    lines: [
      { speaker: 'The Unburied Scribe', text: 'I write what the dead cannot say. Most of it is silence.' },
      { speaker: 'The Unburied Scribe', text: 'The Hollow Bough once held all memory. Now it holds only forgetting.' },
      { speaker: 'The Unburied Scribe', text: 'The king tried to cheat death. Death did not find it amusing.' },
    ],
  });

  nodes.set('cindermoor', {
    id: 'cindermoor',
    lines: [
      { speaker: 'The Unburied Scribe', text: 'This city was beautiful once. I have the records to prove it.' },
      { speaker: 'The Unburied Scribe', text: 'Sir Corvain still guards the gate. He does not know the gate is all that remains.' },
    ],
  });

  nodes.set('gravebloom_marsh', {
    id: 'gravebloom_marsh',
    lines: [
      { speaker: 'The Unburied Scribe', text: 'The flowers grow from grief. The marsh grows from flowers. Grief upon grief.' },
      { speaker: 'The Unburied Scribe', text: 'She was a queen once. Now she is a garden.' },
    ],
  });

  return {
    id: 'scribe',
    npcId: 'unburied_scribe',
    startNodeId: 'ashen_coast',
    nodes,
    onceOnly: new Set(),
  };
}

// ─── Dialogue Manager ────────────────────────────────────────────

export class DialogueManager {
  private trees = new Map<string, DialogueTree>();
  private currentTree: DialogueTree | null = null;
  private currentNode: DialogueNode | null = null;
  private currentLineIndex = 0;
  private isActive = false;
  private visitedNodes = new Set<string>();

  constructor() {
    this.trees.set('waking_choir', createWakingChoirDialogue());
    this.trees.set('coalspine', createCoalspineDialogue());
    this.trees.set('ferro', createFerroDialogue());
    this.trees.set('scribe', createScribeDialogue());
  }

  /** Start a dialogue with an NPC */
  startDialogue(treeId: string): boolean {
    const tree = this.trees.get(treeId);
    if (!tree) return false;

    this.currentTree = tree;
    this.currentNode = tree.nodes.get(tree.startNodeId) ?? null;
    this.currentLineIndex = 0;
    this.isActive = true;

    if (this.currentNode) {
      this.visitedNodes.add(this.currentNode.id);
    }

    return true;
  }

  /** Advance to next line or node */
  advance(): { line: DialogueLine | null; action: string | null; isFinished: boolean } {
    if (!this.isActive || !this.currentTree || !this.currentNode) {
      return { line: null, action: null, isFinished: true };
    }

    this.currentLineIndex++;

    // More lines in current node?
    if (this.currentLineIndex < this.currentNode.lines.length) {
      return {
        line: this.currentNode.lines[this.currentLineIndex],
        action: null,
        isFinished: false,
      };
    }

    // Node finished — check for action
    const action = this.currentNode.action ?? null;

    // Move to next node
    if (this.currentNode.nextNodeId) {
      const nextNode = this.currentTree.nodes.get(this.currentNode.nextNodeId);
      if (nextNode) {
        this.currentNode = nextNode;
        this.currentLineIndex = 0;
        this.visitedNodes.add(nextNode.id);
        return {
          line: this.currentNode.lines[0] ?? null,
          action,
          isFinished: false,
        };
      }
    }

    // No next node — dialogue ends
    this.isActive = false;
    return { line: null, action, isFinished: true };
  }

  /** Get current line without advancing */
  getCurrentLine(): DialogueLine | null {
    if (!this.currentNode) return null;
    return this.currentNode.lines[this.currentLineIndex] ?? null;
  }

  /** Check if dialogue is active */
  getIsActive(): boolean { return this.isActive; }

  /** Get current NPC name */
  getCurrentSpeaker(): string {
    const line = this.getCurrentLine();
    return line?.speaker ?? '';
  }

  /** End dialogue */
  endDialogue(): void {
    this.isActive = false;
    this.currentTree = null;
    this.currentNode = null;
    this.currentLineIndex = 0;
  }

  /** Switch the active start node for a tree (e.g., after boss defeated) */
  setStartNode(treeId: string, nodeId: string): void {
    const tree = this.trees.get(treeId);
    if (tree) {
      tree.startNodeId = nodeId;
    }
  }

  /** Check if a specific node was visited */
  hasVisited(nodeId: string): boolean {
    return this.visitedNodes.has(nodeId);
  }
}
