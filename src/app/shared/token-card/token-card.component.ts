import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Player } from '../../core/models';

@Component({
  selector: 'app-token-card',
  templateUrl: './token-card.component.html',
  styleUrls: ['./token-card.component.scss']
})
export class TokenCardComponent {
  @Input() token!: Player;
  @Output() add = new EventEmitter<Player>();
} 