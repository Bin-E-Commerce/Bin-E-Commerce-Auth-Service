import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";

@Entity("user_addresses")
@Index(["userId"], { unique: true, where: '"is_default" = true' })
export class UserAddress {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  // Thiết lập quan hệ nhiều-nhiều giữa UserAddress và User, với cascade delete để tự động xóa địa chỉ khi user bị xóa
  @ManyToOne(() => User, (user) => user.addresses, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  // Label để người dùng dễ dàng nhận biết địa chỉ này, ví dụ: "Nhà riêng", "Cơ quan", "Nhà ông bà", v.v.
  @Column({ type: "varchar", length: 50 })
  label: string;

  @Column({ name: "full_name", type: "varchar", length: 100 })
  fullName: string;

  @Column({ type: "varchar", length: 20 })
  phone: string;

  // Các trường địa chỉ được chia nhỏ thành province, district, ward và street để dễ dàng quản lý và tìm kiếm
  @Column({ type: "varchar", length: 100 })
  province: string;

  // Dựa trên cấu trúc hành chính của Việt Nam, một địa chỉ thường bao gồm tỉnh/thành phố, quận/huyện, phường/xã và đường phố. Việc chia nhỏ địa chỉ thành các trường này giúp chúng ta có thể dễ dàng quản lý, tìm kiếm và hiển thị địa chỉ một cách linh hoạt hơn.
  @Column({ type: "varchar", length: 100 })
  district: string;

  // Phường/xã là đơn vị hành chính nhỏ hơn quận/huyện, thường được sử dụng để xác định vị trí chính xác hơn trong một khu vực đô thị. Việc lưu trữ phường/xã giúp chúng ta có thể cung cấp các tính năng liên quan đến địa chỉ một cách chi tiết hơn, ví dụ: tìm kiếm địa chỉ gần nhất, phân loại địa chỉ theo khu vực, v.v.
  @Column({ type: "varchar", length: 100 })
  ward: string;

  // Đường phố là phần chi tiết nhất của địa chỉ, thường bao gồm tên đường, số nhà, và các thông tin bổ sung khác như ngõ, hẻm, v.v. Việc lưu trữ đường phố giúp chúng ta có thể hiển thị địa chỉ đầy đủ và chính xác hơn cho người dùng, cũng như hỗ trợ các tính năng liên quan đến địa chỉ một cách chi tiết hơn.
  @Column({ type: "text" })
  street: string;

  // Một người dùng có thể có nhiều địa chỉ, nhưng chỉ có một địa chỉ được đánh dấu là mặc định (isDefault = true). Điều này giúp chúng ta dễ dàng xác định địa chỉ chính của người dùng khi cần thiết, ví dụ: khi đặt hàng hoặc khi hiển thị thông tin người dùng.
  @Column({ name: "is_default", type: "boolean", default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
